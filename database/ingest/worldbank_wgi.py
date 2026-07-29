"""
World Bank WGI(거버넌스 지표) 적재 - P(국가·정책 리스크).
키 불필요. World Bank Indicators API v2.
호출 → 정제 → worldbank_wgi 테이블 UPSERT.

엔드포인트:
  https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=20000
WGI 6개 지표 코드:
  VA.EST 표현·책임성 / PV.EST 정치안정 / GE.EST 정부효과성
  RQ.EST 규제품질 / RL.EST 법치 / CC.EST 부패통제
응답(JSON): [page_meta, [{countryiso3code, date, value, indicator:{id}}, ...]]
"""
import requests
from db import upsert

BASE = "https://api.worldbank.org/v2/country/all/indicator"

INDICATORS = {
    "VA.EST": "Voice and Accountability",
    "PV.EST": "Political Stability",
    "GE.EST": "Government Effectiveness",
    "RQ.EST": "Regulatory Quality",
    "RL.EST": "Rule of Law",
    "CC.EST": "Control of Corruption",
}


def fetch(indicator: str, start_year: int = 2020, end_year: int = 2024) -> list[dict]:
    # 2024년 개편으로 WGI 코드가 GOV_WGI_ 접두사 + source=3 로 바뀜.
    # 저장은 짧은 코드(PV.EST 등)로 유지하되, 호출만 전체 코드로 한다.
    url = f"{BASE}/GOV_WGI_{indicator}"
    params = {"format": "json", "per_page": 20000, "source": "3",
              "date": f"{start_year}:{end_year}"}
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    body = resp.json()
    return body[1] if isinstance(body, list) and len(body) > 1 else []


def clean(indicator: str, raw: list[dict]) -> list[dict]:
    """
    정제: ISO3 → countries.country_code(ISO2) 매핑은 적재 후 조인으로 처리.
    여기선 iso3 를 그대로 넣고, country_code 는 별도 UPDATE 로 채운다.
    (아래 run 에서 iso3 보관용 임시 컬럼 대신 country_code 를 ISO3로 임시 저장)
    """
    rows = []
    for r in raw:
        if r.get("value") is None:
            continue
        rows.append({
            "country_code":   None,                    # ISO3→ISO2 매핑 후 채움
            "iso3_tmp":       r.get("countryiso3code"),  # 매핑용 임시
            "year":           int(r["date"]),
            "indicator_code": indicator,
            "indicator_name": INDICATORS.get(indicator),
            "estimate":       r.get("value"),
        })
    return rows


def run(start_year: int = 2020, end_year: int = 2024):
    for code in INDICATORS:
        raw = fetch(code, start_year, end_year)
        rows = clean(code, raw)
        # ISO3 → ISO2 매핑: countries 테이블 조인으로 country_code 채우기
        rows = _map_iso3(rows)
        upsert("worldbank_wgi", rows,
               ["country_code", "year", "indicator_code"])


def _map_iso3(rows: list[dict]) -> list[dict]:
    """countries 에서 iso3 → country_code(ISO2) 매핑. 매핑 실패행은 제외."""
    from db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT iso3, country_code FROM countries WHERE iso3 IS NOT NULL")
        m = dict(cur.fetchall())
    out = []
    for r in rows:
        cc = m.get(r.pop("iso3_tmp"))
        if cc:
            r["country_code"] = cc
            out.append(r)
    return out


if __name__ == "__main__":
    run()
