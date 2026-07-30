"""
IMF PortWatch(항만 물동량) 적재 - L(물류 리스크) 요소.
키 불필요. ArcGIS FeatureServer 서버측 집계(outStatistics)로 국가별 통계만 받는다.
(원자료 570만+행을 다 받지 않고, ISO3별 portcalls 평균·표준편차를 서버에서 집계)

산출 지표: 국가별 '항만 물동량 변동성'(CV = 표준편차/평균).
  변동성 클수록 물류 처리량이 불안정 → 물류 리스크 高.
출력: portwatch_country_stats(country_code, avg/sd/cv/obs_count/period_from)
"""
import datetime as dt
import json

import requests
from db import get_conn, upsert

FEATURESERVER = ("https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/"
                 "services/Daily_Ports_Data/FeatureServer/0/query")
_STATS = [
    {"statisticType": "avg", "onStatisticField": "portcalls", "outStatisticFieldName": "avg_pc"},
    {"statisticType": "stddev", "onStatisticField": "portcalls", "outStatisticFieldName": "sd_pc"},
    {"statisticType": "count", "onStatisticField": "portcalls", "outStatisticFieldName": "n"},
]


def fetch(from_year: int = 2024) -> list[dict]:
    """ISO3별 portcalls 평균·표준편차·건수를 서버측 groupBy 집계로 가져온다."""
    params = {
        "where": f"year>={from_year}",
        "groupByFieldsForStatistics": "ISO3",
        "outStatistics": json.dumps(_STATS),
        "f": "json",
        "resultRecordCount": 300,
    }
    resp = requests.get(FEATURESERVER, params=params, timeout=120)
    resp.raise_for_status()
    return resp.json().get("features", [])


def clean(raw: list[dict], from_year: int) -> list[dict]:
    """ISO3 → ISO2 매핑 후 CV 계산. 저데이터 국가(건수·평균 미달)는 제외(노이즈)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT iso3, country_code FROM countries WHERE iso3 IS NOT NULL")
        iso = dict(cur.fetchall())

    rows = []
    for f in raw:
        a = f.get("attributes", {})
        cc = iso.get(a.get("ISO3"))
        avg = a.get("avg_pc") or 0
        sd = a.get("sd_pc") or 0
        n = a.get("n") or 0
        if not cc or n < 200 or avg < 0.2:   # 표본·물동량 부족국 제외
            continue
        rows.append({
            "country_code": cc,
            "avg_portcalls": round(float(avg), 3),
            "sd_portcalls": round(float(sd), 3),
            "cv": round(float(sd) / float(avg), 4),
            "obs_count": int(n),
            "period_from": dt.date(from_year, 1, 1).isoformat(),
        })
    return rows


def run(from_year: int = 2024):
    rows = clean(fetch(from_year), from_year)
    upsert("portwatch_country_stats", rows, ["country_code"])


if __name__ == "__main__":
    run()
