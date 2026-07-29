"""
알림 자동생성 — 실데이터(추천 국가의 고위험 SGRI + GDACS 재해)로 사용자별 알림 생성.

트리거: 품목 등록(POST /queries) 또는 재생성 엔드포인트.
전제: 해당 query에 국가 추천(procurement_recommendations)이 이미 생성돼 있어야 함.
"""
from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.query import UserQuery
from app.models.recommendation import ProcurementRecommendation

_SEV_BY_LEVEL = {"Red": "high", "Orange": "medium", "Green": "low"}


def _country_names(db: Session) -> dict[str, str]:
    rows = db.execute(text("SELECT country_code, name_ko FROM countries")).all()
    return {r[0]: r[1] for r in rows}


def generate_alerts_for_query(db: Session, query: UserQuery) -> int:
    """query의 추천 국가들을 근거로 알림을 생성한다. 생성 개수를 반환.
    (user_id가 있어야 함 — 알림은 사용자별로 격리됨)"""
    if not query.hs_code or not query.user_id:
        return 0

    names = _country_names(db)

    # 추천 국가 (SGRI 높은 순)
    recs = db.execute(
        select(ProcurementRecommendation.country_code, ProcurementRecommendation.sgri_score)
        .where(ProcurementRecommendation.query_id == query.query_id)
        .order_by(ProcurementRecommendation.sgri_score.desc())
    ).all()
    if not recs:
        return 0

    created = 0

    def _add(cc: str, atype: str, sev: str, title: str, msg: str) -> None:
        nonlocal created
        # 중복 방지: 같은 (query_id, title) 알림이 이미 있으면 skip
        exists = db.execute(
            text("SELECT 1 FROM alerts WHERE query_id = :q AND title = :t LIMIT 1"),
            {"q": query.query_id, "t": title},
        ).first()
        if exists:
            return
        db.add(Alert(
            user_id=query.user_id, query_id=query.query_id, country_code=cc,
            hs_code=query.hs_code, alert_type=atype, severity=sev,
            title=title, message=msg, is_read=False,
        ))
        created += 1

    # 1) 고위험 SGRI — 가장 위험한 상위 3개국
    for cc, sgri in recs[:3]:
        s = float(sgri or 0)
        if s < 50:
            continue
        nm = names.get(cc, cc)
        sev = "high" if s >= 66 else "medium"
        _add(cc, "정책", sev, f"{nm} 공급망 위험도 높음",
             f"{nm}의 SGRI가 {s:.0f}점으로 높습니다. 대체 조달처 검토를 권고합니다.")

    # 2) GDACS 재해 — 후보국 중 최근 6개월 재해 (국가당 1건)
    candidates = [cc for cc, _ in recs]
    stmt = text("""
        SELECT country_code, event_type_desc, alert_level
        FROM gdacs_alerts
        WHERE country_code IN :ccs
          AND from_date >= (CURRENT_DATE - INTERVAL '6 months')
        ORDER BY from_date DESC
    """).bindparams(bindparam("ccs", expanding=True))
    # 심각도 높은 순으로 정렬해 최대 5건만 (노이즈 방지)
    _LEVEL_RANK = {"Red": 0, "Orange": 1, "Green": 2}
    rows = db.execute(stmt, {"ccs": candidates}).all()
    seen: set[str] = set()
    picked = []
    for cc, etype, level in rows:
        if cc in seen:  # 국가당 1건
            continue
        seen.add(cc)
        picked.append((cc, etype, level))
    picked.sort(key=lambda r: _LEVEL_RANK.get(r[2], 3))
    for cc, etype, level in picked[:5]:
        nm = names.get(cc, cc)
        sev = _SEV_BY_LEVEL.get(level, "low")
        _add(cc, "재해", sev, f"{nm} {etype} 경보",
             f"{nm}에서 최근 {etype}({level}) 발생. 물류·납기 영향 검토가 필요합니다.")

    db.commit()
    return created
