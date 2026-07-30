"""
UN Comtrade Plus 적재.

두 가지 용도로 쓴다:
  1) C(공급처 집중도) — 상대국별 무역 (연 단위)
       run()        → partnerCode=0(World 합계) 행 제외  [기존]
  2) S(수급 불안정성) — 한국 전체 수입의 월별 추세 (관세청 API 대체)
       run_world()  → partnerCode=0(World 합계) 행만, partner_code=NULL 로 저장

  ※ S 는 원래 관세청_품목별 수출입실적(국가 구분 없음)으로 채울 예정이었으나
    공공데이터포털 승인 대기로 Comtrade World 합계행을 임시 대체 소스로 사용한다.
    계산 SQL 은 s_source_monthly 뷰만 바라보므로, 승인 후엔 뷰 정의만 바꾸면 된다.

호출 → 정제 → comtrade_trade_flows 테이블 UPSERT.

응답(JSON) 주요 필드:
  period reporterCode partnerCode flowCode cmdCode
  qty qtyUnitAbbr netWgt primaryValue(=TradeValue USD)
"""
import requests
from config import COMTRADE_API_KEY
from db import upsert

BASE_URL    = "https://comtradeapi.un.org/data/v1/get/C/A/HS"

# 월간(freq=M) 및 키 없는 경우를 위한 엔드포인트
AUTH_URL    = "https://comtradeapi.un.org/data/v1/get/C/{freq}/HS"
PREVIEW_URL = "https://comtradeapi.un.org/public/v1/preview/C/{freq}/HS"

WORLD_M49 = "0"      # Comtrade 에서 World(전세계 합계) 를 뜻하는 partnerCode

CONFLICT_COLS = ["period", "reporter_code", "partner_code", "flow_code", "hs_code"]
# World 행은 partner_code 가 NULL 이라 기본 UNIQUE 로는 ON CONFLICT 가 안 걸린다.
# migrate_comtrade_world_unique.sql 의 부분 유니크 인덱스와 짝을 이룬다.
WORLD_CONFLICT_COLS  = ["period", "reporter_code", "flow_code", "hs_code"]
WORLD_CONFLICT_WHERE = "partner_code IS NULL"


def _endpoint(freq: str) -> tuple[str, dict]:
    """키가 있으면 인증 엔드포인트, 없으면 무료 preview 엔드포인트(500행/호출)를 쓴다."""
    if COMTRADE_API_KEY:
        return AUTH_URL.format(freq=freq), {"Ocp-Apim-Subscription-Key": COMTRADE_API_KEY}
    return PREVIEW_URL.format(freq=freq), {}


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


# ============================================================================
# S(수급 불안정성)용 — 월별 World 합계
# ============================================================================

def fetch_world(reporter_code: str, periods: str, hs_code: str,
                flow: str = "M") -> list[dict]:
    """월별 World 합계만 조회. periods 는 'YYYYMM,YYYYMM,...' 형식."""
    url, headers = _endpoint("M")
    params = {
        "reporterCode": reporter_code,
        "period": periods,
        "cmdCode": hs_code,
        "flowCode": flow,
        "partnerCode": WORLD_M49,
    }
    resp = requests.get(url, params=params, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.json().get("data", [])


def clean_world(raw: list[dict]) -> list[dict]:
    """
    World 합계행만 남기고 partner_code 는 NULL 로 저장한다.
    (스키마 주석: "partner_code NULL = World 합계행")
    reporter 는 M49 → ISO2 변환이 필요하므로 reporter_m49 임시 키로 넘긴다.
    """
    rows = []
    for r in raw:
        if str(r.get("partnerCode")) != WORLD_M49:
            continue
        rows.append({
            "period":          str(r.get("period")),
            "reporter_code":   None,
            "partner_code":    None,               # World 합계
            "reporter_m49":    r.get("reporterCode"),
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


def _map_reporter_m49(rows: list[dict]) -> list[dict]:
    """World 행용 — reporter 만 M49 → ISO2 변환 (partner 는 NULL 유지)."""
    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT m49_code, country_code FROM countries "
                        "WHERE m49_code IS NOT NULL")
            m = {str(k): v for k, v in cur.fetchall()}
    finally:
        conn.close()
    out = []
    for r in rows:
        rc = m.get(str(r.pop("reporter_m49")))
        if rc:
            r["reporter_code"] = rc
            out.append(r)
    return out


def months(start: str, end: str) -> str:
    """'202501','202512' → '202501,202502,...,202512' (periods 파라미터용 헬퍼)."""
    y, m = int(start[:4]), int(start[4:6])
    ey, em = int(end[:4]), int(end[4:6])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return ",".join(out)


def run_world(reporter_code: str, periods: str, hs_code: str, flow: str = "M"):
    """
    S(수급 불안정성)용 — 월별 World 합계 적재. 관세청 API 의 대체 경로.
    periods : months() 로 생성. CV 계산엔 최소 2개, 실무적으로 12개월 이상 권장.
    """
    raw = fetch_world(reporter_code, periods, hs_code, flow)
    rows = _map_reporter_m49(clean_world(raw))
    upsert("comtrade_trade_flows", rows,
           WORLD_CONFLICT_COLS, WORLD_CONFLICT_WHERE)


if __name__ == "__main__":
    # C용 예시: 한국(410) 2023년 HS 283691(리튬 탄산염) 수입 (상대국별)
    run("410", "2023", "283691", "M")
    # S용 예시: 한국(410) 2025년 월별 HS 283691 수입 (World 합계)
    run_world("410", months("202501", "202512"), "283691", "M")
