"""
한국은행 ECOS 적재 - 환율/수입물가지수 (V 가격변동성).
호출 → 정제 → ecos_observations 테이블 UPSERT.

ECOS 는 인증키를 URL 경로에 넣는 방식:
  /StatisticSearch/{key}/json/kr/{start}/{end}/{statCode}/{freq}/{시작}/{끝}/{itemCode}
응답(JSON): StatisticSearch.row = [{STAT_CODE, ITEM_CODE1, TIME, DATA_VALUE, ...}]
"""
import requests
from config import ECOS_API_KEY
from db import upsert

BASE = "https://ecos.bok.or.kr/api/StatisticSearch"


def fetch(stat_code: str, item_code: str, freq: str,
          start: str, end: str, rows: int = 1000) -> list[dict]:
    """
    stat_code : 통계표코드 (예: 731Y001=원/달러 환율)
    item_code : 통계항목코드
    freq      : D(일) M(월) Q(분기) A(연)
    start,end : 기간 (freq 에 맞춰 YYYYMMDD/YYYYMM 등)
    """
    url = (f"{BASE}/{ECOS_API_KEY}/json/kr/1/{rows}/"
           f"{stat_code}/{freq}/{start}/{end}/{item_code}")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("StatisticSearch", {}).get("row", [])


def clean(raw: list[dict]) -> list[dict]:
    """정제: 필드명 매핑, 숫자 변환."""
    rows = []
    for r in raw:
        v = r.get("DATA_VALUE")
        rows.append({
            "stat_code":   r.get("STAT_CODE"),
            "item_code":   r.get("ITEM_CODE1"),
            "time_period": r.get("TIME"),
            "value":       None if v in ("", None) else float(v),
        })
    return rows


def run(stat_code: str, item_code: str, freq: str, start: str, end: str):
    # 관측치 FK를 위해 시계열 메타(ecos_series)를 먼저 UPSERT
    upsert("ecos_series",
           [{"stat_code": stat_code, "item_code": item_code, "freq": freq}],
           ["stat_code", "item_code"])
    raw = fetch(stat_code, item_code, freq, start, end)
    rows = clean(raw)
    upsert("ecos_observations", rows, ["stat_code", "item_code", "time_period"])


if __name__ == "__main__":
    # 예시: 원/달러 환율 일별 (item 0000001 은 주기 D)
    run("731Y001", "0000001", "D", "20240101", "20241231")
