"""
실제 뉴스 사례 (출처 있음).

GDELT DOC 2.0 API(무료·무키)로 해당 품목의 공급망 관련 '실제 기사'를 가져온다.
지어내지 않고 실제 기사 제목·언론사·URL·날짜만 반환한다.
품목이 등록돼 있으면 name_en(영문)으로 검색해 커버리지를 높인다.
실패/무결과 시 빈 목록 반환(프론트가 안내).
"""
import json
import urllib.parse
import urllib.request

from sqlalchemy import text
from sqlalchemy.orm import Session

_GDELT = "https://api.gdeltproject.org/api/v2/doc/doc"
# 공급망 맥락 키워드(영문) — 품목명과 AND로 묶어 관련 기사만 좁힌다.
_CONTEXT = ["supply", "shortage", "sourcing", "export", "import", "price", "procurement", "sanction", "tariff"]


def _fmt_date(seendate: str | None) -> str:
    # GDELT seendate 형식: 20240131T120000Z
    if not seendate or len(seendate) < 8:
        return ""
    return f"{seendate[0:4]}-{seendate[4:6]}-{seendate[6:8]}"


def build_real_cases(db: Session, hs_code: str, item_name_ko: str | None = None) -> dict:
    hs = "".join(ch for ch in str(hs_code) if ch.isdigit())
    row = db.execute(text(
        "SELECT name_ko, name_en FROM hs_codes WHERE hs_code = :h"
    ), {"h": hs}).mappings().first() if hs else None
    name_en = (row or {}).get("name_en") if row else None
    name_ko = item_name_ko or ((row or {}).get("name_ko") if row else None) or f"HS {hs}"
    # GDELT는 영어 뉴스 위주 → 영문명 우선, 없으면 한글명.
    term = (name_en or name_ko or "").strip()
    if not term:
        return {"articles": [], "query": "", "source": "gdelt"}

    # 희소 품목도 결과가 나오게 품목명만으로 검색(맥락 AND 강제 제거). 최신순.
    query = f'"{term}"' if " " in term else term
    url = f"{_GDELT}?" + urllib.parse.urlencode({
        "query": query, "mode": "artlist", "format": "json",
        "maxrecords": 25, "sort": "datedesc", "timespan": "12m",
    })
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SupplyGuard/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001 - 네트워크/파싱 실패 → 빈 결과
        return {"articles": [], "query": query, "source": "gdelt", "term": term}

    seen: set[str] = set()
    articles = []
    for a in (data.get("articles") or []) if isinstance(data, dict) else []:
        u = a.get("url")
        domain = a.get("domain") or ""
        if not u or domain in seen:  # 언론사당 1건(다양성)
            continue
        seen.add(domain)
        articles.append({
            "title": a.get("title") or u,
            "url": u,
            "domain": domain,
            "date": _fmt_date(a.get("seendate")),
        })
        if len(articles) >= 8:
            break
    return {"articles": articles, "query": query, "term": term, "source": "gdelt"}
