"""
UN Comtrade Plus 적재 (국가별 무역 → C 집중도 계산의 원천).
호출 → 정제 → comtrade_trade_flows 테이블 UPSERT.

응답(JSON) 주요 필드:
  period reporterCode partnerCode flowCode cmdCode
  qty qtyUnitAbbr netWgt primaryValue(=TradeValue USD)
"""
import requests
from config import COMTRADE_API_KEY
from db import upsert

BASE_URL = "https://comtradeapi.un.org/data/v1/get/C/A/HS"


def fetch(reporter_code: str, period: str, hs_code: str,
          flow: str = "M") -> list[dict]:
    """
    reporter_code : 신고국 M49 코드 (예: 410=한국)
    period        : 연도(YYYY) 또는 연월
    hs_code       : HS 코드
    flow          : M(수입) X(수출)
    """
    params = {
        "reporterCode": reporter_code,
        "period": period,
        "cmdCode": hs_code,
        "flowCode": flow,
        "partnerCode": None,   # None = 전체 상대국 (집중도 계산에 필요)
    }
    headers = {"Ocp-Apim-Subscription-Key": COMTRADE_API_KEY}
    resp = requests.get(BASE_URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json().get("data", [])


def clean(raw: list[dict]) -> list[dict]:
    """
    정제: 필드명 매핑 + M49 국가코드 → ISO 매핑은 별도 countries 테이블 조인으로 처리.
    TODO(팀 결정): partnerCode=0(World 합계) 행 제외, HS 자릿수 통일.
    """
    rows = []
    for r in raw:
        if r.get("partnerCode") in (0, "0"):   # World 합계행 제외
            continue
        rows.append({
            "period":          str(r.get("period")),
            "reporter_code":   None,               # 아래 _map_m49 에서 채움
            "partner_code":    None,
            "reporter_m49":    r.get("reporterCode"),  # M49 → ISO2 변환용 임시
            "partner_m49":     r.get("partnerCode"),
            "flow_code":       r.get("flowCode"),
            "flow_desc":       r.get("flowDesc"),
            "hs_code":         r.get("cmdCode"),
            "classification":  r.get("classificationCode"),
            "qty":             r.get("qty"),
            "qty_unit":        r.get("qtyUnitAbbr"),
            "net_weight_kg":   r.get("netWgt"),
            "trade_value_usd": r.get("primaryValue"),
        })
    return rows


def _map_m49(rows: list[dict]) -> list[dict]:
    """M49 숫자 국가코드 → countries.m49_code 조인으로 ISO2 변환.
    reporter/partner 둘 다 매핑돼야 유지(집중도 계산에 양쪽 필요)."""
    from db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT m49_code, country_code FROM countries WHERE m49_code IS NOT NULL")
        m = {str(k): v for k, v in cur.fetchall()}
    out = []
    for r in rows:
        rc = m.get(str(r.pop("reporter_m49")))
        pc = m.get(str(r.pop("partner_m49")))
        if rc and pc:
            r["reporter_code"], r["partner_code"] = rc, pc
            out.append(r)
    return out


def run(reporter_code: str, period: str, hs_code: str, flow: str = "M"):
    raw = fetch(reporter_code, period, hs_code, flow)
    rows = _map_m49(clean(raw))
    upsert("comtrade_trade_flows", rows,
           ["period", "reporter_code", "partner_code", "flow_code", "hs_code"])


if __name__ == "__main__":
    # 예시: 한국(410) 2023년 HS 283691(리튬 탄산염) 수입
    run("410", "2023", "283691", "M")
