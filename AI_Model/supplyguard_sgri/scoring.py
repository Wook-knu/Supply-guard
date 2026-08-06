from __future__ import annotations

import math
from typing import Any

from .api_clients import (
    ApiFetchResult,
    ComtradeClient,
    CustomsClient,
    EcosClient,
    FredClient,
    GdacsClient,
    GdeltClient,
    PortWatchClient,
    WorldBankClient,
    price_volatility_metrics,
)
from .http_client import JsonHttpClient
from .models import ComponentScore, Evidence, SgriRequest, SgriResponse, clamp, today_iso
from .weighting import BASE_WEIGHTS, WeightDecision, determine_weights


# Product-defined baseline constants. They are not learned coefficients and must
# be calibrated against actual shortage, delay, and cost outcomes before any
# predictive-performance claim is made.
WEIGHTS = dict(BASE_WEIGHTS)
LABELS = {
    "S": "Supply instability",
    "P": "Policy and country risk",
    "V": "Price volatility",
    "L": "Logistics risk",
    "C": "Supplier concentration",
    "E": "ESG and carbon regulation",
}
LABELS_KO = {
    "S": "수급 불안정성",
    "P": "국가·정책 리스크",
    "V": "가격 변동성",
    "L": "물류 리스크",
    "C": "공급처 집중도",
    "E": "ESG·탄소규제",
}
RISK_LEVELS_KO = {
    "low": "낮음",
    "medium": "보통",
    "high": "높음",
    "very_high": "매우 높음",
}
WEIGHT_REASONS_KO = {
    "S": "공급 차질은 생산 중단으로 직접 전파되므로 가장 높은 25%를 적용했습니다.",
    "P": "관세·제재·수출규제 등 정책 충격은 조달 가능성과 비용을 동시에 바꾸므로 20%를 적용했습니다.",
    "V": "원자재·부품 가격 급등은 구매비와 마진에 즉시 영향을 주는 운영 리스크이므로 15%를 적용했습니다.",
    "L": "항만 혼잡, 운임 급등, 납기 지연은 재고 소진과 생산 일정에 영향을 주므로 15%를 적용했습니다.",
    "C": "특정 공급처나 국가 의존도가 높으면 대체 조달이 어려워지므로 15%를 적용했습니다.",
    "E": "탄소규제와 ESG 실사는 중장기 규제 대응 리스크이므로 기본 10%를 적용했습니다.",
}

CBAM_HS_PREFIXES = {
    "2523": "cement",
    "28": "hydrogen/chemicals",
    "31": "fertilizers",
    "72": "iron and steel",
    "73": "iron and steel products",
    "76": "aluminium",
    "2716": "electricity",
}


def evaluate_sgri(request: SgriRequest) -> SgriResponse:
    fetched = fetch_external_data(request)
    metrics = dict(fetched.metrics)
    evidence = list(fetched.evidence)
    api_errors = [error.to_dict() for error in fetched.errors]

    price_metrics = price_volatility_metrics(request.unit_price_history)
    if price_metrics:
        metrics.update(price_metrics)
        evidence.append(
            Evidence(
                source="customer_input",
                title="Unit price history",
                observed_at=today_iso(),
                confidence=76,
                metric="price_history",
                value={"points": price_metrics["price_points"]},
            )
        )

    components = {
        "S": score_supply_instability(request, metrics, evidence),
        "P": score_policy_risk(request, metrics, evidence),
        "V": score_price_volatility(request, metrics, evidence),
        "L": score_logistics_risk(request, metrics, evidence),
        "C": score_concentration_risk(request, metrics, evidence),
        "E": score_esg_risk(request, metrics, evidence),
    }

    weight_decision = determine_weights(
        request.weight_options,
        build_weight_component_context(components),
        request_context={
            "hs_code": request.hs_code,
            "item_name": request.item_name,
            "import_country": request.import_country,
            "supplier_country": request.supplier_country,
            "manual_notes": request.manual_notes,
            "quantity": request.quantity,
            "target_price": request.target_price,
            "delivery_date": request.delivery_due_date,
            "quality_certification": request.quality_certification,
        },
    )
    effective_weights = weight_decision.effective_weights
    for key, component in components.items():
        component.weight = effective_weights[key]
        calculated_reason = weight_decision.rationales.get(key)
        if calculated_reason:
            component.weight_reason = calculated_reason

    score = sum(components[key].score * effective_weights[key] for key in effective_weights)
    confidence = sum(
        components[key].confidence * effective_weights[key] for key in effective_weights
    )
    level = risk_level(score)
    input_summary = build_input_summary(request)
    recommendations = build_recommendations(request, components)
    rag_report = build_rag_report(
        request,
        score,
        level,
        confidence,
        components,
        api_errors,
        weight_decision,
    )
    return SgriResponse(
        score=score,
        level=level,
        confidence=confidence,
        input_summary=input_summary,
        components=components,
        recommendations=recommendations,
        rag_report=rag_report,
        weight_profile=weight_decision.to_dict(),
    )


def fetch_external_data(request: SgriRequest) -> ApiFetchResult:
    result = ApiFetchResult()
    options = request.api_options
    if not options.use_live_apis:
        return result

    http = JsonHttpClient(timeout_seconds=options.timeout_seconds)
    country_specific = request.import_country != "GLOBAL"
    if options.include_world_bank and country_specific:
        result.extend(WorldBankClient(http).fetch_country_risk(request.import_country))
    if options.include_gdelt:
        result.extend(
            GdeltClient(http).search_articles(
                request.query_terms(),
                timespan=options.gdelt_timespan,
                max_records=options.gdelt_max_records,
            )
        )
    if options.include_gdacs and country_specific:
        result.extend(GdacsClient(http).fetch_disasters(request.import_country))
    if options.include_fred and request.fred_series_id:
        result.extend(FredClient(http).fetch_series(request.fred_series_id))
    if options.include_customs and country_specific:
        result.extend(
            CustomsClient(http).fetch_item_trade(
                request.hs_code,
                request.customs_start_yymm,
                request.customs_end_yymm,
                country_code=request.import_country,
            )
        )
    if options.include_ecos:
        result.extend(
            EcosClient(http).fetch_series(
                request.ecos_stat_code,
                request.ecos_item_code,
                request.ecos_frequency,
                request.ecos_start,
                request.ecos_end,
            )
        )
    if options.include_portwatch and country_specific:
        result.extend(PortWatchClient(http).fetch_activity(request.import_country))
    if options.include_comtrade:
        result.extend(
            ComtradeClient(http).fetch_import_partners(
                hs_code=request.hs_code,
                reporter_code=request.comtrade_reporter_code,
                period=request.comtrade_period,
                partner_code=request.comtrade_partner_code,
            )
        )
    if result.metrics.get("fred_values"):
        fred_metrics = price_volatility_metrics(result.metrics["fred_values"])
        for key, value in fred_metrics.items():
            result.metrics[f"fred_{key}"] = value
        if not request.unit_price_history:
            result.metrics.update(fred_metrics)
    if not request.unit_price_history and result.metrics.get("ecos_values"):
        result.metrics.update(price_volatility_metrics(result.metrics["ecos_values"]))
    return result


def score_supply_instability(request: SgriRequest, metrics: dict[str, Any], evidence: list[Evidence]) -> ComponentScore:
    parts: list[tuple[float, float, str]] = []
    if request.supplier_share_pct is not None:
            parts.append((clamp(request.supplier_share_pct), 0.25, f"주요 공급처 의존도가 {request.supplier_share_pct:.1f}%입니다."))
    top_share = metrics.get("comtrade_top_partner_share_pct")
    if top_share is not None:
        parts.append((clamp(float(top_share)), 0.25, f"교역 데이터상 최대 공급국 비중이 {float(top_share):.1f}%입니다."))
    if request.alternate_supplier_count is not None:
        alt_score = alternate_supplier_score(request.alternate_supplier_count)
        parts.append((alt_score, 0.25, f"대체 공급처 수가 {request.alternate_supplier_count}개입니다."))
    inventory_days = computed_inventory_days(request)
    if inventory_days is not None:
        inventory_score = inverse_threshold_score(inventory_days, low_good=60, high_bad=7)
        parts.append((inventory_score, 0.20, f"현재 재고 커버리지가 {inventory_days:.1f}일입니다."))
    if request.lead_time_days is not None:
        lead_score = clamp(request.lead_time_days / 90 * 100)
        parts.append((lead_score, 0.15, f"평균 리드타임이 {request.lead_time_days:.1f}일입니다."))
    news_score = news_pressure_score(metrics, ["shortage", "export ban", "sanction"])
    if news_score > 0:
        parts.append((news_score, 0.15, "최근 뉴스에서 공급 차질 관련 신호가 감지되었습니다."))
    if metrics.get("customs_supply_cv") is not None:
        customs_cv = float(metrics["customs_supply_cv"])
        parts.append(
            (
                clamp(customs_cv * 300),
                0.25,
                f"관세청 수입중량 변동계수(CV)가 {customs_cv:.3f}입니다.",
            )
        )
    return make_component("S", parts, evidence, metrics)


def score_policy_risk(request: SgriRequest, metrics: dict[str, Any], evidence: list[Evidence]) -> ComponentScore:
    parts: list[tuple[float, float, str]] = []
    wgi_keys = [
        "voice_accountability",
        "political_stability",
        "government_effectiveness",
        "regulatory_quality",
        "rule_of_law",
        "control_corruption",
    ]
    wgi_values = [
        float(metrics[key]) for key in wgi_keys if metrics.get(key) is not None
    ]
    if wgi_values:
        wgi_risk = sum(governance_estimate_to_risk(value) for value in wgi_values) / len(
            wgi_values
        )
        parts.append(
            (
                wgi_risk,
                0.50,
                f"World Bank WGI {len(wgi_values)}개 거버넌스 지표의 평균 위험 환산값이 {wgi_risk:.1f}점입니다.",
            )
        )
    if metrics.get("weighted_tariff") is not None:
        tariff = float(metrics["weighted_tariff"])
        year = metrics.get("weighted_tariff_year") or "최근 연도"
        parts.append((clamp(tariff * 4), 0.25, f"World Bank API 가중 평균 관세율({year})이 {tariff:.1f}%입니다."))
    if metrics.get("trade_gdp_pct") is not None:
        trade_gdp = float(metrics["trade_gdp_pct"])
        year = metrics.get("trade_gdp_pct_year") or "최근 연도"
        parts.append(
            (
                clamp(trade_gdp),
                0.15,
                f"World Bank API 무역의존도({year}, Trade % of GDP)가 {trade_gdp:.1f}%로, 무역정책 변화에 대한 노출도를 반영했습니다.",
            )
        )
    policy_news = news_pressure_score(metrics, ["export ban", "sanction", "tariff", "regulation", "customs"])
    if policy_news > 0:
        article_count = int(metrics.get("gdelt_article_count") or 0)
        parts.append((policy_news, 0.10, f"GDELT API 최근 뉴스 {article_count}건에서 제재·관세·수출규제 등 정책 리스크 신호가 감지되었습니다."))
    if not parts:
        if request.api_options.use_live_apis:
            parts.append((50, 0.1, "World Bank/GDELT API에서 유효한 정책 지표를 받지 못해 임시 기준값 50점을 적용했습니다."))
        else:
            parts.append((50, 0.1, "외부 API 호출이 꺼져 있어 정책 리스크는 임시 기준값 50점을 적용했습니다."))
    return make_component("P", parts, evidence, metrics)


def score_price_volatility(request: SgriRequest, metrics: dict[str, Any], evidence: list[Evidence]) -> ComponentScore:
    parts: list[tuple[float, float, str]] = []
    cv = metrics.get("price_cv")
    change_pct = metrics.get("latest_price_change_pct")
    if cv is not None:
        parts.append((clamp(float(cv) * 300), 0.60, f"가격 변동계수(CV)가 {float(cv):.3f}입니다."))
    if change_pct is not None:
        parts.append((clamp(abs(float(change_pct)) * 2), 0.40, f"최근 가격 변화율이 {float(change_pct):.1f}%입니다."))
    if metrics.get("fred_values"):
        fred_points = int(metrics.get("fred_price_points") or len(metrics.get("fred_values") or []))
        fred_change = metrics.get("fred_latest_price_change_pct")
        if request.unit_price_history:
            if fred_change is not None:
                parts.append((clamp(abs(float(fred_change)) * 2), 0.10, f"FRED API 외부 가격 시계열 {fred_points}개를 함께 확인했으며 최근 변화율은 {float(fred_change):.1f}%입니다."))
            else:
                parts.append((45, 0.05, f"FRED API 외부 가격 시계열 {fred_points}개를 가격 리스크 보조 지표로 확인했습니다."))
        else:
            parts.append((45, 0.05, f"FRED API 외부 가격 시계열 {fred_points}개를 원자재 가격 대리 지표로 반영했습니다."))
    if metrics.get("ecos_price_cv") is not None:
        ecos_cv = float(metrics["ecos_price_cv"])
        ecos_change = float(metrics.get("ecos_latest_price_change_pct") or 0)
        parts.append(
            (
                clamp(ecos_cv * 300 + abs(ecos_change)),
                0.20,
                f"한국은행 ECOS 시계열 변동계수는 {ecos_cv:.3f}입니다.",
            )
        )
    if metrics.get("customs_price_cv") is not None:
        customs_price_cv = float(metrics["customs_price_cv"])
        parts.append(
            (
                clamp(customs_price_cv * 300),
                0.15,
                f"관세청 수입 단가 대리값 변동계수는 {customs_price_cv:.3f}입니다.",
            )
        )
    if not parts:
        parts.append((45, 0.1, "가격 시계열이 없어 보수적 기준값 45점을 적용했습니다."))
    return make_component("V", parts, evidence, metrics)


def score_logistics_risk(request: SgriRequest, metrics: dict[str, Any], evidence: list[Evidence]) -> ComponentScore:
    parts: list[tuple[float, float, str]] = []
    if request.shipment_delay_days is not None:
        parts.append((clamp(request.shipment_delay_days / 21 * 100), 0.35, f"현재 운송 지연이 {request.shipment_delay_days:.1f}일입니다."))
    if request.delivery_due_date and request.shipment_delay_days:
        parts.append((clamp(request.shipment_delay_days / 14 * 100), 0.10, "납기일이 있는 건에서 실제 지연 신호가 있습니다."))
    if metrics.get("lpi_overall") is not None:
        lpi = float(metrics["lpi_overall"])
        lpi_risk = clamp((5 - lpi) / 4 * 100)
        parts.append((lpi_risk, 0.25, f"물류성과 지표를 위험 점수 {lpi_risk:.1f}점으로 환산했습니다."))
    logistics_news = news_pressure_score(metrics, ["strike", "port congestion", "delay"])
    if logistics_news > 0:
        parts.append((logistics_news, 0.20, "최근 뉴스에서 항만 혼잡·파업·운송 지연 신호가 감지되었습니다."))
    if metrics.get("gdacs_event_count") is not None:
        event_count = int(metrics["gdacs_event_count"])
        if event_count:
            parts.append((clamp(event_count * 18), 0.20, f"수입국 또는 경로 주변 재난 이벤트가 {event_count}건 감지되었습니다."))
    if metrics.get("portwatch_portcall_cv") is not None:
        portwatch_cv = float(metrics["portwatch_portcall_cv"])
        parts.append(
            (
                clamp(portwatch_cv * 250),
                0.20,
                f"PortWatch 항만 호출량 변동계수(CV)가 {portwatch_cv:.3f}입니다.",
            )
        )
    if not parts:
        parts.append((40, 0.1, "물류 리스크 데이터가 부족하여 기준값 40점을 적용했습니다."))
    return make_component("L", parts, evidence, metrics)


def score_concentration_risk(request: SgriRequest, metrics: dict[str, Any], evidence: list[Evidence]) -> ComponentScore:
    parts: list[tuple[float, float, str]] = []
    if request.supplier_share_pct is not None:
        parts.append((clamp(request.supplier_share_pct), 0.45, f"주요 공급처 의존도가 {request.supplier_share_pct:.1f}%입니다."))
    if metrics.get("comtrade_hhi") is not None:
        hhi = float(metrics["comtrade_hhi"])
        parts.append((clamp(hhi), 0.35, f"교역 집중도 지표를 {hhi:.1f}점으로 환산했습니다."))
    if metrics.get("comtrade_top_partner_share_pct") is not None:
        top_share = float(metrics["comtrade_top_partner_share_pct"])
        parts.append((clamp(top_share), 0.25, f"최대 공급국 비중이 {top_share:.1f}%입니다."))
    if request.alternate_supplier_count is not None:
        parts.append((alternate_supplier_score(request.alternate_supplier_count), 0.25, f"대체 공급처 수가 {request.alternate_supplier_count}개입니다."))
    if not parts:
        parts.append((55, 0.1, "공급처 집중도 데이터가 부족하여 보수적 기준값 55점을 적용했습니다."))
    return make_component("C", parts, evidence, metrics)


def score_esg_risk(request: SgriRequest, metrics: dict[str, Any], evidence: list[Evidence]) -> ComponentScore:
    parts: list[tuple[float, float, str]] = []
    cbam_category = cbam_category_for_hs(request.hs_code)
    if cbam_category:
        parts.append((75, 0.40, f"HS 코드가 탄소규제 민감 품목군({cbam_category})에 해당합니다."))
    else:
        parts.append((25, 0.15, "HS 코드가 기본 탄소규제 민감 품목군에는 해당하지 않습니다."))
    if metrics.get("co2_per_capita") is not None:
        co2 = float(metrics["co2_per_capita"])
        parts.append((clamp(co2 / 20 * 100), 0.30, f"국가 탄소배출 대리 지표가 {co2:.2f}입니다."))
    esg_news = news_pressure_score(metrics, ["carbon", "CBAM", "regulation"])
    if esg_news > 0:
        parts.append((esg_news, 0.20, "최근 뉴스에서 ESG·탄소규제 관련 신호가 감지되었습니다."))
    return make_component("E", parts, evidence, metrics)


def make_component(
    key: str,
    parts: list[tuple[float, float, str]],
    all_evidence: list[Evidence],
    all_metrics: dict[str, Any],
) -> ComponentScore:
    total_weight = sum(weight for _, weight, _ in parts) or 1.0
    score = sum(score * weight for score, weight, _ in parts) / total_weight
    reasons = [reason for _, _, reason in parts]
    matching_evidence = filter_evidence_for_component(key, all_evidence)
    confidence = confidence_from_evidence(matching_evidence, default=55 if len(parts) <= 1 else 65)
    return ComponentScore(
        key=key,
        label=LABELS[key],
        label_ko=LABELS_KO[key],
        weight=WEIGHTS[key],
        score=clamp(score),
        confidence=confidence,
        weight_reason=WEIGHT_REASONS_KO[key],
        reasons=reasons,
        evidence=matching_evidence[:12],
        metrics=extract_component_metrics(key, all_metrics),
        api_usage=build_api_usage_for_component(key, all_metrics),
    )


def build_api_usage_for_component(key: str, metrics: dict[str, Any]) -> list[dict[str, Any]]:
    usage: list[dict[str, Any]] = []

    def add(
        api: str,
        indicator: str,
        metric_key: str,
        value: Any,
        *,
        used: bool = True,
        note: str | None = None,
    ) -> None:
        if value is None:
            return
        usage.append(
            {
                "api": api,
                "indicator": indicator,
                "metric_key": metric_key,
                "value": value,
                "score_usage": "점수 산정 반영" if used else "조회됨, 위험 신호 0건이라 점수 영향 없음",
                "note": note,
            }
        )

    def add_gdelt(terms: list[str], indicator: str) -> None:
        if "gdelt_article_count" not in metrics and "gdelt_keyword_hits" not in metrics:
            return
        article_count = int(metrics.get("gdelt_article_count") or 0)
        hits = metrics.get("gdelt_keyword_hits") or {}
        selected_hits = {term: int(hits.get(term, 0)) for term in terms if int(hits.get(term, 0))}
        hit_count = sum(selected_hits.values())
        value = f"뉴스 {article_count}건, 관련 키워드 {hit_count}건"
        note = f"감지 키워드: {selected_hits}" if selected_hits else "감지 키워드 없음"
        add("GDELT API", indicator, "gdelt_article_count/gdelt_keyword_hits", value, used=(article_count > 0 or hit_count > 0), note=note)

    if key == "S":
        if "comtrade_top_partner_share_pct" in metrics:
            add(
                "UN Comtrade API",
                "HS 코드 기준 최대 공급국 비중",
                "comtrade_top_partner_share_pct",
                f"{float(metrics['comtrade_top_partner_share_pct']):.1f}%",
            )
        add_gdelt(["shortage", "export ban", "sanction"], "공급 차질 뉴스 신호")
        if "customs_supply_cv" in metrics:
            add(
                "관세청 API",
                "HS 코드 기준 수입중량 변동계수",
                "customs_supply_cv",
                f"{float(metrics['customs_supply_cv']):.3f}",
            )

    elif key == "P":
        wgi_labels = {
            "voice_accountability": "발언권·책임성",
            "political_stability": "정치적 안정성",
            "government_effectiveness": "정부 효과성",
            "regulatory_quality": "규제 품질",
            "rule_of_law": "법치주의",
            "control_corruption": "부패 통제",
        }
        for metric_key, label in wgi_labels.items():
            if metric_key in metrics:
                add(
                    "World Bank WGI API",
                    label,
                    metric_key,
                    f"{float(metrics[metric_key]):.3f}",
                    note=f"위험 환산: {governance_estimate_to_risk(float(metrics[metric_key])):.1f}점",
                )
        if "weighted_tariff" in metrics:
            add(
                "World Bank API",
                "가중 평균 관세율",
                "weighted_tariff",
                f"{float(metrics['weighted_tariff']):.1f}%",
                note=f"기준 연도: {metrics.get('weighted_tariff_year', '최근 연도')}",
            )
        if "trade_gdp_pct" in metrics:
            add(
                "World Bank API",
                "무역의존도(Trade % of GDP)",
                "trade_gdp_pct",
                f"{float(metrics['trade_gdp_pct']):.1f}%",
                note=f"기준 연도: {metrics.get('trade_gdp_pct_year', '최근 연도')}",
            )
        add_gdelt(["export ban", "sanction", "tariff", "regulation", "customs"], "정책 리스크 뉴스 신호")

    elif key == "V":
        if metrics.get("fred_values") or "fred_price_points" in metrics:
            points = int(metrics.get("fred_price_points") or len(metrics.get("fred_values") or []))
            change = metrics.get("fred_latest_price_change_pct")
            if change is None:
                value = f"시계열 {points}개"
            else:
                value = f"시계열 {points}개, 최근 변화율 {float(change):.1f}%"
            add(
                "FRED API",
                "외부 가격 시계열",
                "fred_values/fred_latest_price_change_pct",
                value,
                used=points > 0,
                note=f"series_id: {metrics.get('fred_series_id', '미입력')}",
            )
        if "ecos_price_cv" in metrics:
            add(
                "한국은행 ECOS API",
                "환율·물가 시계열 변동계수",
                "ecos_price_cv",
                f"{float(metrics['ecos_price_cv']):.3f}",
            )
        if "customs_price_cv" in metrics:
            add(
                "관세청 API",
                "수입금액/중량 단가 변동계수",
                "customs_price_cv",
                f"{float(metrics['customs_price_cv']):.3f}",
            )

    elif key == "L":
        if "lpi_overall" in metrics:
            add(
                "World Bank API",
                "물류성과지수(LPI)",
                "lpi_overall",
                f"{float(metrics['lpi_overall']):.2f}",
            )
        if "gdacs_event_count" in metrics:
            event_count = int(metrics["gdacs_event_count"])
            add("GDACS RSS", "재난 경보 건수", "gdacs_event_count", f"{event_count}건", used=event_count > 0)
        add_gdelt(["strike", "port congestion", "delay"], "물류 뉴스 신호")
        if "portwatch_record_count" in metrics:
            add(
                "IMF PortWatch",
                "항만 활동 원천 레코드",
                "portwatch_record_count",
                f"{int(metrics['portwatch_record_count'])}건",
                used="portwatch_portcall_cv" in metrics,
                note=(
                    f"항만 호출량 CV: {float(metrics['portwatch_portcall_cv']):.3f}"
                    if "portwatch_portcall_cv" in metrics
                    else "유효한 항만 호출량 시계열 없음"
                ),
            )

    elif key == "C":
        if "comtrade_hhi" in metrics:
            add("UN Comtrade API", "HS 코드 기준 공급국 집중도(HHI)", "comtrade_hhi", f"{float(metrics['comtrade_hhi']):.1f}점")
        if "comtrade_top_partner_share_pct" in metrics:
            add(
                "UN Comtrade API",
                "HS 코드 기준 최대 공급국 비중",
                "comtrade_top_partner_share_pct",
                f"{float(metrics['comtrade_top_partner_share_pct']):.1f}%",
            )

    elif key == "E":
        if "co2_per_capita" in metrics:
            add(
                "World Bank API",
                "국가 탄소배출 대리 지표",
                "co2_per_capita",
                f"{float(metrics['co2_per_capita']):.2f}",
            )
        add_gdelt(["carbon", "CBAM", "regulation"], "ESG·탄소규제 뉴스 신호")

    return usage


def confidence_from_evidence(evidence: list[Evidence], default: float) -> float:
    if not evidence:
        return default
    return clamp(sum(item.confidence for item in evidence) / len(evidence))


def filter_evidence_for_component(key: str, evidence: list[Evidence]) -> list[Evidence]:
    metric_names = {
        "S": {"trade_concentration", "customs_trade", "article", "price_history"},
        "P": {
            "voice_accountability",
            "political_stability",
            "government_effectiveness",
            "regulatory_quality",
            "rule_of_law",
            "control_corruption",
            "weighted_tariff",
            "article",
        },
        "V": {"price_history", "price_series"},
        "L": {"lpi_overall", "disaster_event", "port_activity", "article"},
        "C": {"trade_concentration"},
        "E": {"co2_per_capita", "article"},
    }[key]
    return [item for item in evidence if item.metric in metric_names]


def extract_component_metrics(key: str, metrics: dict[str, Any]) -> dict[str, Any]:
    prefixes = {
        "S": ["comtrade_top_partner_share_pct", "customs_supply_cv", "customs_supply_change_pct", "gdelt_article_count", "gdelt_keyword_hits"],
        "P": [
            "voice_accountability",
            "voice_accountability_year",
            "political_stability",
            "political_stability_year",
            "government_effectiveness",
            "government_effectiveness_year",
            "regulatory_quality",
            "regulatory_quality_year",
            "rule_of_law",
            "rule_of_law_year",
            "control_corruption",
            "control_corruption_year",
            "weighted_tariff",
            "weighted_tariff_year",
            "trade_gdp_pct",
            "trade_gdp_pct_year",
            "gdelt_keyword_hits",
        ],
        "V": ["price_cv", "latest_price_change_pct", "price_points", "fred_series_id", "fred_price_cv", "fred_latest_price_change_pct", "fred_price_points", "ecos_price_cv", "ecos_latest_price_change_pct", "ecos_price_points", "customs_price_cv", "customs_price_change_pct"],
        "L": ["lpi_overall", "gdacs_event_count", "portwatch_record_count", "portwatch_portcall_cv", "portwatch_portcall_change_pct", "gdelt_keyword_hits"],
        "C": ["comtrade_hhi", "comtrade_top_partner_share_pct"],
        "E": ["co2_per_capita", "gdelt_keyword_hits"],
    }[key]
    return {name: metrics[name] for name in prefixes if name in metrics}


def risk_level(score: float) -> str:
    if score <= 30:
        return "low"
    if score <= 60:
        return "medium"
    if score <= 80:
        return "high"
    return "very_high"


def governance_estimate_to_risk(value: float) -> float:
    return clamp((2.5 - value) / 5.0 * 100)


def alternate_supplier_score(count: int) -> float:
    if count <= 0:
        return 100
    if count == 1:
        return 75
    if count == 2:
        return 50
    if count <= 4:
        return 30
    return 15


def inverse_threshold_score(value: float, low_good: float, high_bad: float) -> float:
    if value <= high_bad:
        return 100
    if value >= low_good:
        return 0
    return clamp((low_good - value) / (low_good - high_bad) * 100)


def computed_inventory_days(request: SgriRequest) -> float | None:
    if request.inventory_days is not None:
        return request.inventory_days
    if request.current_stock is not None and request.monthly_demand:
        daily_demand = request.monthly_demand / 30.0
        if daily_demand > 0:
            return request.current_stock / daily_demand
    return None


def news_pressure_score(metrics: dict[str, Any], terms: list[str]) -> float:
    hits = metrics.get("gdelt_keyword_hits") or {}
    count = sum(int(hits.get(term, 0)) for term in terms)
    article_count = int(metrics.get("gdelt_article_count") or 0)
    raw = count * 18 + min(article_count, 30) * 1.5
    return clamp(raw)


def cbam_category_for_hs(hs_code: str) -> str | None:
    clean = "".join(ch for ch in str(hs_code) if ch.isdigit())
    for prefix, label in sorted(CBAM_HS_PREFIXES.items(), key=lambda item: len(item[0]), reverse=True):
        if clean.startswith(prefix):
            return label
    return None


def build_input_summary(request: SgriRequest) -> dict[str, Any]:
    enabled_apis: list[str] = []
    if request.api_options.use_live_apis:
        country_specific = request.import_country != "GLOBAL"
        if request.api_options.include_world_bank and country_specific:
            enabled_apis.append("World Bank")
        if request.api_options.include_gdelt:
            enabled_apis.append("GDELT")
        if request.api_options.include_gdacs and country_specific:
            enabled_apis.append("GDACS")
        if request.api_options.include_comtrade:
            enabled_apis.append("UN Comtrade")
        if request.api_options.include_fred:
            enabled_apis.append("FRED")
        if request.api_options.include_customs:
            enabled_apis.append("관세청")
        if request.api_options.include_ecos:
            enabled_apis.append("한국은행 ECOS")
        if request.api_options.include_portwatch and country_specific:
            enabled_apis.append("IMF PortWatch")

    return {
        "거래 희망 품목": {
            "HS 코드": request.hs_code,
            "품목명": request.item_name,
            "수량": request.quantity,
            "실제 단가": (
                int(request.target_price)
                if request.target_price is not None
                and float(request.target_price).is_integer()
                else request.target_price
            ),
            "납기일": request.delivery_due_date,
            "품질/인증 기준": request.quality_certification,
        },
        "외부 데이터": {
            "외부 API 사용 여부": "사용" if request.api_options.use_live_apis else "미사용",
            "활성화 API": enabled_apis if enabled_apis else "없음",
        },
    }


def format_percent(value: float | None) -> str:
    if value is None:
        return "미입력"
    return f"{value:.1f}%"


def format_days(value: float | None) -> str:
    if value is None:
        return "미입력"
    return f"{value:.1f}일"


def build_recommendations(request: SgriRequest, components: dict[str, ComponentScore]) -> list[str]:
    ordered = sorted(components.values(), key=lambda item: item.score * item.weight, reverse=True)
    recommendations: list[str] = []
    for component in ordered[:3]:
        if component.key == "S":
            recommendations.append("위험도가 높은 품목은 안전재고 확대 또는 선발주를 검토하세요.")
        elif component.key == "P":
            recommendations.append(
                "추천 후보국별 관세·제재·수출규제 변화를 확인하세요."
                if request.import_country == "GLOBAL"
                else f"{request.import_country} 관련 관세·제재·수출규제 변화를 정기적으로 확인하세요."
            )
        elif component.key == "V":
            recommendations.append("다음 구매 계약에는 가격 연동 조항 또는 헤지 기준을 반영하세요.")
        elif component.key == "L":
            recommendations.append("지연 가능성이 있는 선적은 대체 운송 경로와 납기 버퍼를 준비하세요.")
        elif component.key == "C":
            recommendations.append("대체 공급처 후보를 확보하고 최소 1개 공급처를 추가 검증하세요.")
        elif component.key == "E":
            recommendations.append("CBAM·ESG 대응을 위해 공급처 배출량 및 규제 증빙 자료를 준비하세요.")
    if request.supplier_country or request.import_country != "GLOBAL":
        recommendations.append(f"{request.supplier_country or request.import_country} 의존도 완화 계획을 검토하세요.")
    return recommendations[:5]


def build_rag_report(
    request: SgriRequest,
    score: float,
    level: str,
    confidence: float,
    components: dict[str, ComponentScore],
    api_errors: list[dict[str, Any]],
    weight_decision: WeightDecision,
) -> dict[str, Any]:
    ordered = sorted(components.values(), key=lambda item: item.score * item.weight, reverse=True)
    drivers = [
        {
            "key": item.key,
            "label": item.label_ko,
            "score": round(item.score, 1),
            "weighted_score": round(item.score * item.weight, 2),
            "top_reason": item.reasons[0] if item.reasons else None,
        }
        for item in ordered[:4]
    ]
    return {
        "title": f"{request.item_name} / HS {request.hs_code} SGRI 요약",
        "summary": f"종합 위험도는 {score:.1f}점({RISK_LEVELS_KO.get(level, level)})이며, 주요 기여 항목은 {', '.join(driver['key'] for driver in drivers[:3])}입니다.",
        "drivers": drivers,
        "weight_basis": {
            "version": weight_decision.formula_version,
            "strategy": weight_decision.strategy,
            "status": weight_decision.status,
            "uses_llm": weight_decision.uses_llm,
            "calibration_note": (
                "LLM 제안 가중치는 정규화와 변동폭 검증 후 적용합니다. "
                "최종 점수 계산은 Python 수식이 수행합니다."
            ),
            "weights": {
                key: {
                    "label": LABELS_KO[key],
                    "weight_percent": round(components[key].weight * 100, 1),
                    "reason": components[key].weight_reason,
                }
                for key in WEIGHTS
            },
        },
        "data_quality_note": data_quality_note(api_errors, request.api_options.use_live_apis),
        "caveat": "SGRI는 확정적 예측값이 아니라 공급망 위험 수준과 대응 우선순위 판단을 돕는 참고 지표입니다.",
    }


def build_weight_component_context(
    components: dict[str, ComponentScore],
) -> dict[str, dict[str, Any]]:
    return {
        key: {
            "label": component.label_ko,
            "score": round(component.score, 3),
            "confidence": round(component.confidence, 3),
            "reasons": component.reasons[:8],
            "metrics": component.metrics,
        }
        for key, component in components.items()
    }


def data_quality_note(api_errors: list[dict[str, Any]], use_live_apis: bool) -> str:
    if not use_live_apis:
        return "외부 API 호출 없이 입력 데이터 기준으로 산출했습니다."
    if not api_errors:
        return "입력 데이터와 사용 가능한 외부 신호를 기준으로 산출했습니다."
    return "일부 외부 데이터가 부족하여 해당 항목은 기준값 또는 입력 데이터 중심으로 산출했습니다."
