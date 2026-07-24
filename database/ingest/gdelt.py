"""
GDELT(전세계 뉴스 이벤트) 적재 - P(국가·정책 리스크) 보조.
키 불필요. GDELT 2.0 DOC API (톤 타임라인).
호출 → 정제 → gdelt_events 테이블 UPSERT.

주의: GDELT 는 규모가 크고 국가 매핑/톤 해석이 까다로움(2차 고도화 대상).
여기서는 국가별 뉴스 '평균 톤(avg_tone)'을 일 단위로 경량 집계하는 골격만 제공.

엔드포인트:
  https://api.gdeltproject.org/api/v2/doc/doc
  ?query={키워드} sourcecountry:{FIPS}&mode=timelinetone&format=json
"""
import requests
from db import upsert

BASE = "https://api.gdeltproject.org/api/v2/doc/doc"


def fetch(query: str, country_fips: str, months: int = 3) -> list[dict]:
    params = {
        "query": f"{query} sourcecountry:{country_fips}",
        "mode": "timelinetone",
        "format": "json",
        "timespan": f"{months}m",
    }
    resp = requests.get(BASE, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    # timeline[0].data = [{date, value(avg tone)}, ...]
    series = data.get("timeline", [])
    return series[0].get("data", []) if series else []


def clean(country_code: str, raw: list[dict]) -> list[dict]:
    """톤 타임라인 → gdelt_events 컬럼 매핑."""
    rows = []
    for r in raw:
        d = str(r.get("date", ""))[:10]
        rows.append({
            "event_date":      d,
            "country_code":    country_code,
            "avg_tone":        r.get("value"),
            "num_articles":    r.get("norm"),
        })
    return rows


def run(country_code: str, country_fips: str, query: str = "trade"):
    raw = fetch(query, country_fips)
    rows = clean(country_code, raw)
    # gdelt_events 엔 UNIQUE 제약이 없어 append 방식 → 필요시 스키마에 제약 추가
    if rows:
        from db import get_conn
        cols = list(rows[0].keys())
        vals = [[r.get(c) for c in cols] for r in rows]
        from psycopg2.extras import execute_values
        sql = f"INSERT INTO gdelt_events ({', '.join(cols)}) VALUES %s"
        with get_conn() as conn, conn.cursor() as cur:
            execute_values(cur, sql, vals)
            conn.commit()
        print(f"[gdelt_events] {len(rows)}행 적재")


if __name__ == "__main__":
    # 예시: 중국(FIPS CH) 무역 관련 뉴스 톤
    run("CN", "CH", "trade")
