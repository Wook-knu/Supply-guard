"""
관세청 품목별 수출입실적 (data.go.kr, 15101609) 적재.
호출 → 정제 → customs_item_trade_stats 테이블 UPSERT.

요청 파라미터(공식):
  serviceKey : 인증키
  strtYymm   : 조회 시작 년월 (YYYYMM)
  endYymm    : 조회 종료 년월 (YYYYMM)
  hsSgn      : HS 부호 (품목)
응답(XML) 주요 필드:
  year(년월) statKor(품목명) hsCd(HS) expWgt expDlr impWgt impDlr balPayments
"""
import requests
import xml.etree.ElementTree as ET
from config import CUSTOMS_API_KEY
from db import upsert

BASE_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"


def fetch(hs_code: str, start_yymm: str, end_yymm: str) -> list[dict]:
    """관세청 API 호출 → 원본 XML 파싱해서 dict 리스트 반환."""
    params = {
        "serviceKey": CUSTOMS_API_KEY,
        "strtYymm": start_yymm,
        "endYymm": end_yymm,
        "hsSgn": hs_code,
    }
    resp = requests.get(BASE_URL, params=params, timeout=30)
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    items = []
    for item in root.iter("item"):
        items.append({child.tag: (child.text or "").strip() for child in item})
    return items


def clean(raw: list[dict]) -> list[dict]:
    """
    정제: 숫자 문자열 → int, 필드명 → DB 컬럼명으로 매핑.
    TODO(팀 결정): period 형식 통일(YYYY.MM vs YYYYMM), 합계행(총계) 제외 규칙.
    """
    def to_int(v):
        try:
            return int(str(v).replace(",", ""))
        except (ValueError, TypeError):
            return None

    rows = []
    for r in raw:
        # 관세청 응답엔 품목합계/총계 행이 섞여 나옴 → HS 코드 없는 행 skip
        hs = r.get("hsCd")
        if not hs:
            continue
        rows.append({
            "period":        r.get("year"),          # 예: 2024.01
            "hs_code":       hs,
            "item_name_ko":  r.get("statKor"),
            "export_wgt_kg": to_int(r.get("expWgt")),
            "export_usd":    to_int(r.get("expDlr")),
            "import_wgt_kg": to_int(r.get("impWgt")),
            "import_usd":    to_int(r.get("impDlr")),
            "trade_balance": to_int(r.get("balPayments")),
        })
    return rows


def run(hs_code: str, start_yymm: str, end_yymm: str):
    raw = fetch(hs_code, start_yymm, end_yymm)
    rows = clean(raw)
    upsert("customs_item_trade_stats", rows, ["period", "hs_code"])


if __name__ == "__main__":
    # 예시: HS 0202(냉동 소고기) 2024년 1~3월
    run("0202", "202401", "202403")
