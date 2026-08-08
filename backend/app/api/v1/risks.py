"""
국가별 SGRI 위험도 조회 라우터 (F-05, 프론트 risks / dashboard 화면).
- GET /risks                         : 전체 (SGRI 높은 순)
- GET /risks?hs_code=283691          : 특정 품목
- GET /risks?hs_code=283691&country=CL : 특정 품목·국가
※ queries.py 를 복사해 만든 '조회 전용' 라우터 패턴.
"""
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.risk import CountryRiskScore
from app.schemas.risk import RiskScoreOut

router = APIRouter(prefix="/risks", tags=["risks"])

_CUSTOMS_URL = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"


def _yymm_range(back_months: int = 12, lag: int = 1) -> tuple[str, str]:
    """현재 기준 최근 N개월 창(YYYYMM)을 만든다. lag=관세청 데이터 지연 보정(개월)."""
    today = date.today()
    y, m = today.year, today.month - lag
    while m <= 0:
        m += 12
        y -= 1
    end = f"{y}{m:02d}"
    sy, sm = y, m - (back_months - 1)
    while sm <= 0:
        sm += 12
        sy -= 1
    return f"{sy}{sm:02d}", end


def _fetch_customs(hs_code: str, country: str, start: str, end: str) -> list[dict]:
    key = os.environ.get("CUSTOMS_API_KEY")
    if not key:
        return []
    url = _CUSTOMS_URL + "?" + urllib.parse.urlencode({
        "serviceKey": urllib.parse.unquote(key),
        "strtYymm": start, "endYymm": end, "hsSgn": hs_code, "cntyCd": country,
    })
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            root = ET.fromstring(resp.read().decode("utf-8"))
    except Exception:
        return []
    out: list[dict] = []
    for item in root.iter("item"):
        period = (item.findtext("year") or "").strip()
        hs = (item.findtext("hsCd") or "").strip()
        if not period or period == "총계" or hs == "-":
            continue

        def num(tag: str) -> float:
            try:
                return float((item.findtext(tag) or "0").replace(",", ""))
            except (TypeError, ValueError):
                return 0.0

        wgt, dlr = num("impWgt"), num("impDlr")
        out.append({
            "period": period,
            "imp_wgt": wgt,
            "imp_dlr": dlr,
            "unit_price": round(dlr / wgt, 2) if wgt else None,
        })
    out.sort(key=lambda r: r["period"])
    return out


def _debug_customs(hs_code: str, country: str, start: str, end: str) -> dict:
    key = os.environ.get("CUSTOMS_API_KEY") or ""
    info: dict = {"key_len": len(key), "key_head": key[:6]}
    url = _CUSTOMS_URL + "?" + urllib.parse.urlencode({
        "serviceKey": urllib.parse.unquote(key),
        "strtYymm": start, "endYymm": end, "hsSgn": hs_code, "cntyCd": country,
    })
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            raw = resp.read().decode("utf-8", "replace")
        m = re.search(r"<resultMsg>(.*?)</resultMsg>", raw) or re.search(r"<returnAuthMsg>(.*?)</returnAuthMsg>", raw)
        info["http"] = "ok"
        info["resultMsg"] = m.group(1) if m else None
        info["item_count"] = raw.count("<item>")
        info["raw_head"] = raw[:200]
    except Exception as exc:  # noqa: BLE001
        info["http"] = "error"
        info["error"] = repr(exc)[:200]
    return info


@router.get("/customs-series")
def customs_series(
    hs_code: str = Query(..., description="HS 코드"),
    country: str = Query(..., description="국가코드(ISO2)"),
    debug: int = Query(default=0),
):
    """관세청 월별 수입 실적(수입중량·단가) 시계열 — 공급 변동 추이용. CUSTOMS_API_KEY 필요."""
    if not os.environ.get("CUSTOMS_API_KEY"):
        return {"series": [], "source": "관세청", "note": "CUSTOMS_API_KEY 미설정"}
    start, end = _yymm_range(12, lag=1)
    series = _fetch_customs(hs_code, country, start, end)
    if not series:  # 최근 12개월 데이터가 없으면 직전 12개월로 1회 폴백
        start, end = _yymm_range(12, lag=13)
        series = _fetch_customs(hs_code, country, start, end)
    resp = {"series": series, "start": start, "end": end, "source": "관세청 수출입실적"}
    if debug:
        resp["debug"] = _debug_customs(hs_code, country, start, end)
    return resp


@router.get("", response_model=list[RiskScoreOut])
def list_risks(
    hs_code: str | None = Query(default=None, description="HS 코드로 필터"),
    country: str | None = Query(default=None, description="국가코드(ISO2)로 필터"),
    db: Session = Depends(get_db),
):
    """조건에 맞는 국가별 SGRI 점수를 위험도 높은 순으로 반환."""
    stmt = select(CountryRiskScore)
    if hs_code:
        stmt = stmt.where(CountryRiskScore.hs_code == hs_code)
    if country:
        stmt = stmt.where(CountryRiskScore.country_code == country)
    stmt = stmt.order_by(CountryRiskScore.sgri_score.desc())
    return db.execute(stmt).scalars().all()
