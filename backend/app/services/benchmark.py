"""
벤치마크 — 우리 SGRI 데이터셋 안에서의 '상대 위치'.

정직한 데이터 기반(경쟁사 사례를 지어내지 않음):
  1) 품목 지표 프로파일: 이 품목의 6지표 평균 vs 전체 품목 평균
  2) 국가 상대 위치: 특정 국가가 그 품목 후보국 중 상위 몇 %로 위험한지(percentile)
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

_KEYS = [("score_s", "수급 불안정성"), ("score_c", "공급처 집중도"), ("score_v", "가격 변동성"),
         ("score_l", "물류 리스크"), ("score_p", "국가·정책 리스크"), ("score_e", "ESG·탄소규제")]

# 기업 벤치마크 지표: (컬럼, 라벨, 방향) — low=낮을수록 우수, high=높을수록 우수
_SUP_METRICS = [
    ("unit_price", "예상 단가", "low"),
    ("lead_time_days", "리드타임", "low"),
    ("on_time_delivery_rate", "정시 납품률", "high"),
    ("defect_rate_pct", "불량률", "low"),
]


def _verdict(delta: float) -> str:
    if delta >= 5:
        return "평균보다 위험"
    if delta <= -5:
        return "평균보다 안전"
    return "평균 수준"


def compute_benchmark(db: Session, hs_code: str, country_code: str | None = None) -> dict:
    """품목/국가의 상대 위치를 계산."""
    hs = "".join(ch for ch in str(hs_code) if ch.isdigit())

    cols = ", ".join(f"avg({k})" for k, _ in _KEYS)
    # 이 품목 평균
    item = db.execute(text(
        f"SELECT avg(sgri_score), {cols} FROM country_risk_scores WHERE hs_code = :h"
    ), {"h": hs}).one()
    if item[0] is None:
        return {"hs_code": hs, "error": "no data"}
    # 전체 품목 평균 (기준선)
    allrow = db.execute(text(
        f"SELECT avg(sgri_score), {cols} FROM country_risk_scores WHERE hs_code IS NOT NULL"
    )).one()

    item_sgri = round(float(item[0]), 1)
    all_sgri = round(float(allrow[0]), 1)

    indicators = []
    for i, (k, label) in enumerate(_KEYS, start=1):
        iv = item[i]
        av = allrow[i]
        if iv is None or av is None:
            continue
        iv, av = round(float(iv), 1), round(float(av), 1)
        indicators.append({
            "key": k[-1].upper(), "label": label,
            "item_avg": iv, "all_avg": av,
            "delta": round(iv - av, 1), "verdict": _verdict(iv - av),
        })

    result = {
        "hs_code": hs,
        "basis": "SupplyGuard 전체 품목·국가 SGRI 데이터 기준",
        "item_avg_sgri": item_sgri,
        "all_items_avg_sgri": all_sgri,
        "sgri_delta": round(item_sgri - all_sgri, 1),
        "sgri_verdict": _verdict(item_sgri - all_sgri),
        "indicators": indicators,
    }

    # 국가 상대 위치 (선택)
    if country_code:
        cc = country_code.upper()
        raw_cols = ", ".join(k for k, _ in _KEYS)
        crow = db.execute(text(
            f"SELECT sgri_score, {raw_cols} FROM country_risk_scores "
            f"WHERE hs_code = :h AND country_code = :c ORDER BY as_of_date DESC LIMIT 1"
        ), {"h": hs, "c": cc}).first()
        if crow is not None and crow[0] is not None:
            csgri = round(float(crow[0]), 1)
            stats = db.execute(text(
                "SELECT count(*), sum(CASE WHEN sgri_score <= :s THEN 1 ELSE 0 END) "
                "FROM country_risk_scores WHERE hs_code = :h AND sgri_score IS NOT NULL"
            ), {"h": hs, "s": float(crow[0])}).one()
            total, le = int(stats[0]), int(stats[1] or 0)
            safer_pct = round((le - 1) / total * 100, 0) if total else 0
            risk_percentile = round(100 - safer_pct, 0)
            # 국가 지표값 vs 이 품목 전체국가 평균(item[i])
            c_inds = []
            for i, (k, label) in enumerate(_KEYS, start=1):
                cv, av = crow[i], item[i]
                if cv is None or av is None:
                    continue
                cv, av = round(float(cv), 1), round(float(av), 1)
                c_inds.append({"key": k[-1].upper(), "label": label, "value": cv,
                               "item_avg": av, "delta": round(cv - av, 1), "verdict": _verdict(cv - av)})
            result["country"] = {
                "country_code": cc,
                "sgri": csgri,
                "item_avg_sgri": item_sgri,            # 이 품목 전체국가 평균(비교 기준)
                "candidate_countries": total,
                "risk_percentile": risk_percentile,
                "vs_item_avg": round(csgri - item_sgri, 1),
                "verdict": _verdict(csgri - item_sgri),
                "indicators": c_inds,
                "summary": f"{cc}는 이 품목 후보 {total}개국 중 위험 상위 {risk_percentile:.0f}% 수준이며, "
                           f"품목 평균({item_sgri}) 대비 {csgri - item_sgri:+.1f}점입니다.",
            }
    return result


def _sup_verdict(value: float, avg: float, direction: str) -> str:
    """방향(low/high) 고려한 판정."""
    better = value < avg if direction == "low" else value > avg
    close = abs(value - avg) < 1e-9 or (avg != 0 and abs(value - avg) / abs(avg) < 0.03)
    if close:
        return "평균 수준"
    return "우수" if better else "미흡"


def compute_supplier_benchmark(db: Session, query_id: int, company_id: int) -> dict:
    """기업 벤치마크 — 후보 공급사들끼리 조달지표(단가·납기·품질)로 비교.
    ※ SGRI(국가지수) 아님. 기업 고유 지표로 상대 위치를 계산한다."""
    rows = db.execute(text(
        "SELECT c.company_id, c.name, c.unit_price, c.lead_time_days, "
        "c.on_time_delivery_rate, c.defect_rate_pct, sr.fit_score "
        "FROM supplier_recommendations sr JOIN companies c ON c.company_id = sr.company_id "
        "WHERE sr.query_id = :q"
    ), {"q": query_id}).mappings().all()
    if not rows:
        return {"query_id": query_id, "error": "no candidates"}

    target = next((r for r in rows if r["company_id"] == company_id), None)
    if target is None:
        return {"query_id": query_id, "company_id": company_id, "error": "not a candidate"}

    metrics = []
    for col, label, direction in _SUP_METRICS:
        vals = [float(r[col]) for r in rows if r[col] is not None]
        tv = target[col]
        if tv is None or not vals:
            continue
        tv = float(tv)
        avg = sum(vals) / len(vals)
        # 순위(우수 방향 기준): 더 우수한 후보 수 + 1
        better_cnt = sum(1 for v in vals if (v < tv if direction == "low" else v > tv))
        rank = better_cnt + 1
        metrics.append({
            "key": col, "label": label, "value": round(tv, 2),
            "candidate_avg": round(avg, 2), "better_is": direction,
            "rank": rank, "candidate_count": len(vals),
            "verdict": _sup_verdict(tv, avg, direction),
        })

    return {
        "query_id": query_id,
        "company_id": company_id,
        "company_name": target["name"],
        "candidate_count": len(rows),
        "fit_score": round(float(target["fit_score"]), 1) if target["fit_score"] is not None else None,
        "basis": "이 품목 후보 공급사들의 조달지표 기준(SGRI 아님)",
        "metrics": metrics,
    }
