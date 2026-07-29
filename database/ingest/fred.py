"""
FRED (세인트루이스 연준) 적재 - 원자재가/환율 시계열 (V 가격변동성).
호출 → 정제 → fred_observations 테이블 UPSERT.

응답(JSON): observations = [{date, value}, ...]
"""
import requests
from config import FRED_API_KEY
from db import upsert

BASE_URL = "https://api.stlouisfed.org/fred/series/observations"


def fetch(series_id: str, start: str = "2020-01-01") -> list[dict]:
    """
    series_id : FRED 시계열 코드 (예: PALLFNFINDEXM=글로벌 원자재가격지수)
    start     : 조회 시작일 (YYYY-MM-DD)
    """
    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": start,
    }
    resp = requests.get(BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("observations", [])


def clean(series_id: str, raw: list[dict]) -> list[dict]:
    """정제: '.'(결측)은 None, 문자열 → float."""
    rows = []
    for r in raw:
        v = r.get("value")
        rows.append({
            "series_id": series_id,
            "obs_date":  r.get("date"),
            "value":     None if v in (".", "", None) else float(v),
        })
    return rows


def run(series_id: str, start: str = "2020-01-01"):
    # 관측치 FK를 위해 시계열 메타(fred_series)를 먼저 UPSERT
    # (title도 함께 넣어 단일컬럼 UPSERT의 빈 SET 문법오류 회피)
    upsert("fred_series", [{"series_id": series_id, "title": series_id}], ["series_id"])
    raw = fetch(series_id, start)
    rows = clean(series_id, raw)
    upsert("fred_observations", rows, ["series_id", "obs_date"])


if __name__ == "__main__":
    # 예시: 글로벌 원자재 가격지수
    run("PALLFNFINDEXM")
