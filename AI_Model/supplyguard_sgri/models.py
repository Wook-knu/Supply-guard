from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from .countries import normalize_country


SCORE_KEYS = ("S", "P", "V", "L", "C", "E")


def _as_float(value: Any, default: float | None = None) -> float | None:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int | None = None) -> int | None:
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


@dataclass(slots=True)
class ApiOptions:
    use_live_apis: bool = True
    timeout_seconds: float = 8.0
    gdelt_timespan: str = "7d"
    gdelt_max_records: int = 50
    include_gdacs: bool = True
    include_world_bank: bool = True
    include_gdelt: bool = True
    include_comtrade: bool = True
    include_fred: bool = True
    include_customs: bool = True
    include_ecos: bool = True
    include_portwatch: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ApiOptions":
        data = data or {}
        return cls(
            use_live_apis=_as_bool(data.get("use_live_apis"), True),
            timeout_seconds=_as_float(data.get("timeout_seconds"), 8.0) or 8.0,
            gdelt_timespan=str(data.get("gdelt_timespan") or "7d"),
            gdelt_max_records=_as_int(data.get("gdelt_max_records"), 50) or 50,
            include_gdacs=_as_bool(data.get("include_gdacs"), True),
            include_world_bank=_as_bool(data.get("include_world_bank"), True),
            include_gdelt=_as_bool(data.get("include_gdelt"), True),
            include_comtrade=_as_bool(data.get("include_comtrade"), True),
            include_fred=_as_bool(data.get("include_fred"), True),
            include_customs=_as_bool(data.get("include_customs"), True),
            include_ecos=_as_bool(data.get("include_ecos"), True),
            include_portwatch=_as_bool(data.get("include_portwatch"), True),
        )


@dataclass(slots=True)
class WeightOptions:
    """Controls SGRI weight selection and its validation bounds."""

    strategy: str = "reliability"
    max_adjustment: float = 0.08
    reliability_floor: float = 0.25
    model: str = "gemini-3.6-flash"
    reasoning_effort: str = "minimal"
    timeout_seconds: float = 30.0

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "WeightOptions":
        data = data or {}
        strategy = str(data.get("strategy") or "reliability").strip().lower()
        if strategy not in {"fixed", "reliability", "llm"}:
            raise ValueError(
                "weight_options.strategy must be fixed, reliability, or llm"
            )

        max_adjustment = _as_float(data.get("max_adjustment"), 0.08)
        reliability_floor = _as_float(data.get("reliability_floor"), 0.25)
        model = str(data.get("model") or "gemini-3.6-flash").strip()
        reasoning_effort = str(
            data.get("reasoning_effort") or "minimal"
        ).strip().lower()
        timeout_seconds = _as_float(data.get("timeout_seconds"), 30.0)
        if max_adjustment is None or not 0 <= max_adjustment <= 0.25:
            raise ValueError("weight_options.max_adjustment must be between 0 and 0.25")
        if reliability_floor is None or not 0 <= reliability_floor <= 1:
            raise ValueError("weight_options.reliability_floor must be between 0 and 1")
        if model != "gemini-3.6-flash":
            raise ValueError("weight_options.model must be gemini-3.6-flash")
        if reasoning_effort not in {"minimal", "low", "medium", "high"}:
            raise ValueError("unsupported weight_options.reasoning_effort")
        if timeout_seconds is None or timeout_seconds <= 0:
            raise ValueError("weight_options.timeout_seconds must be greater than zero")

        return cls(
            strategy=strategy,
            max_adjustment=float(max_adjustment),
            reliability_floor=float(reliability_floor),
            model=model,
            reasoning_effort=reasoning_effort,
            timeout_seconds=float(timeout_seconds),
        )


@dataclass(slots=True)
class ProcurementProfile:
    """User input defined by the requirements workbook."""

    hs_code: str
    item_name: str
    quantity: float
    target_price: int
    delivery_date: str
    quality_certification: str

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ProcurementProfile":
        if not isinstance(data, dict):
            raise ValueError("procurement must be a JSON object")
        hs_code = (
            str(data.get("hs_code") or "")
            .strip()
            .replace(".", "")
            .replace("-", "")
            .replace(" ", "")
        )
        item_name = str(data.get("item_name") or "").strip()
        quantity = _as_float(data.get("quantity"))
        target_price = _as_float(data.get("target_price"))
        delivery_date = str(data.get("delivery_date") or "").strip()
        quality = str(data.get("quality_certification") or "").strip()
        if not hs_code.isdigit() or len(hs_code) not in {2, 4, 6, 10}:
            raise ValueError(
                "procurement.hs_code must contain 2, 4, 6, or 10 digits"
            )
        if not item_name:
            raise ValueError("procurement.item_name is required")
        if quantity is None or quantity <= 0:
            raise ValueError("procurement.quantity must be greater than zero")
        if target_price is None or target_price <= 0:
            raise ValueError("procurement.target_price must be greater than zero")
        if not float(target_price).is_integer():
            raise ValueError(
                "procurement.target_price must be an integer without decimals"
            )
        try:
            parsed_delivery_date = date.fromisoformat(delivery_date)
        except ValueError as exc:
            raise ValueError(
                "procurement.delivery_date must use YYYY-MM-DD"
            ) from exc
        if parsed_delivery_date < date.today():
            raise ValueError("procurement.delivery_date cannot be in the past")
        if not quality:
            raise ValueError("procurement.quality_certification is required")
        return cls(
            hs_code=hs_code,
            item_name=item_name,
            quantity=float(quantity),
            target_price=int(target_price),
            delivery_date=delivery_date,
            quality_certification=quality,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "hs_code": self.hs_code,
            "item_name": self.item_name,
            "quantity": self.quantity,
            "target_price": self.target_price,
            "delivery_date": self.delivery_date,
            "quality_certification": self.quality_certification,
        }


@dataclass(slots=True)
class SgriRequest:
    hs_code: str
    item_name: str
    import_country: str
    quantity: float | None = None
    target_price: float | None = None
    quality_certification: str = ""
    supplier_name: str | None = None
    supplier_country: str | None = None
    supplier_share_pct: float | None = None
    alternate_supplier_count: int | None = None
    inventory_days: float | None = None
    lead_time_days: float | None = None
    shipment_delay_days: float | None = None
    delivery_due_date: str | None = None
    monthly_demand: float | None = None
    current_stock: float | None = None
    unit_price_history: list[float] = field(default_factory=list)
    fred_series_id: str | None = None
    customs_start_yymm: str | None = None
    customs_end_yymm: str | None = None
    ecos_stat_code: str | None = None
    ecos_item_code: str | None = None
    ecos_frequency: str | None = None
    ecos_start: str | None = None
    ecos_end: str | None = None
    comtrade_reporter_code: str | None = None
    comtrade_partner_code: str | None = None
    comtrade_period: str | None = None
    manual_notes: list[str] = field(default_factory=list)
    api_options: ApiOptions = field(default_factory=ApiOptions)
    weight_options: WeightOptions = field(default_factory=WeightOptions)

    def __post_init__(self) -> None:
        if self.supplier_share_pct is not None and not 0 <= self.supplier_share_pct <= 100:
            raise ValueError("supplier_share_pct must be between 0 and 100")
        if self.alternate_supplier_count is not None and self.alternate_supplier_count < 0:
            raise ValueError("alternate_supplier_count cannot be negative")
        for name in (
            "inventory_days",
            "lead_time_days",
            "shipment_delay_days",
            "monthly_demand",
            "current_stock",
            "quantity",
            "target_price",
        ):
            value = getattr(self, name)
            if value is not None and value < 0:
                raise ValueError(f"{name} cannot be negative")
        if any(value < 0 for value in self.unit_price_history):
            raise ValueError("unit_price_history cannot contain negative values")

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SgriRequest":
        required = ["hs_code", "item_name", "import_country"]
        missing = [key for key in required if not data.get(key)]
        if missing:
            raise ValueError(f"Missing required field(s): {', '.join(missing)}")

        price_history = data.get("unit_price_history") or []
        if not isinstance(price_history, list):
            raise ValueError("unit_price_history must be a list of numbers")

        return cls(
            hs_code=str(data["hs_code"]).strip(),
            item_name=str(data["item_name"]).strip(),
            import_country=(
                "GLOBAL"
                if str(data["import_country"]).strip().upper() == "GLOBAL"
                else normalize_country(
                    data["import_country"],
                    "procurement.import_country",
                )
            ),
            quantity=_as_float(data.get("quantity")),
            target_price=_as_float(data.get("target_price")),
            quality_certification=str(
                data.get("quality_certification") or ""
            ).strip(),
            supplier_name=data.get("supplier_name"),
            supplier_country=(
                normalize_country(
                    data["supplier_country"],
                    "procurement.supplier_country",
                )
                if data.get("supplier_country")
                else None
            ),
            supplier_share_pct=_as_float(data.get("supplier_share_pct")),
            alternate_supplier_count=_as_int(data.get("alternate_supplier_count")),
            inventory_days=_as_float(data.get("inventory_days")),
            lead_time_days=_as_float(data.get("lead_time_days")),
            shipment_delay_days=_as_float(data.get("shipment_delay_days")),
            delivery_due_date=data.get("delivery_due_date"),
            monthly_demand=_as_float(data.get("monthly_demand")),
            current_stock=_as_float(data.get("current_stock")),
            unit_price_history=[float(x) for x in price_history if _as_float(x) is not None],
            fred_series_id=data.get("fred_series_id"),
            customs_start_yymm=data.get("customs_start_yymm"),
            customs_end_yymm=data.get("customs_end_yymm"),
            ecos_stat_code=data.get("ecos_stat_code"),
            ecos_item_code=data.get("ecos_item_code"),
            ecos_frequency=data.get("ecos_frequency"),
            ecos_start=data.get("ecos_start"),
            ecos_end=data.get("ecos_end"),
            comtrade_reporter_code=data.get("comtrade_reporter_code"),
            comtrade_partner_code=data.get("comtrade_partner_code"),
            comtrade_period=data.get("comtrade_period"),
            manual_notes=[str(x) for x in (data.get("manual_notes") or [])],
            api_options=ApiOptions.from_dict(data.get("api_options")),
            weight_options=WeightOptions.from_dict(data.get("weight_options")),
        )

    def query_terms(self) -> list[str]:
        terms = [self.item_name, self.hs_code]
        if self.import_country != "GLOBAL":
            terms.append(self.import_country)
        if self.supplier_country:
            terms.append(self.supplier_country)
        if self.supplier_name:
            terms.append(self.supplier_name)
        return [term for term in terms if term]


@dataclass(slots=True)
class Evidence:
    source: str
    title: str
    url: str | None = None
    observed_at: str | None = None
    confidence: float = 50.0
    metric: str | None = None
    value: Any = None
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "title": self.title,
            "url": self.url,
            "observed_at": self.observed_at,
            "confidence": round(clamp(self.confidence), 1),
            "metric": self.metric,
            "value": self.value,
            "note": self.note,
        }


@dataclass(slots=True)
class ComponentScore:
    key: str
    label: str
    label_ko: str
    weight: float
    score: float
    confidence: float
    weight_reason: str = ""
    reasons: list[str] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    api_usage: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label_ko,
            "weight": self.weight,
            "weight_percent": round(self.weight * 100, 1),
            "score": round(clamp(self.score), 1),
            "weighted_score": round(clamp(self.score) * self.weight, 2),
            "confidence": round(clamp(self.confidence), 1),
            "weight_reason": self.weight_reason,
            "reasons": self.reasons,
            "metrics": self.metrics,
            "api_usage": self.api_usage,
        }


@dataclass(slots=True)
class SgriResponse:
    score: float
    level: str
    confidence: float
    input_summary: dict[str, Any]
    components: dict[str, ComponentScore]
    recommendations: list[str]
    rag_report: dict[str, Any]
    weight_profile: dict[str, Any] = field(default_factory=dict)
    generated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"))

    def to_dict(self) -> dict[str, Any]:
        ordered_components = [self.components[key].to_dict() for key in SCORE_KEYS if key in self.components]
        api_usage_summary = [
            {
                "component": item["key"],
                "component_label": item["label"],
                **usage,
            }
            for item in ordered_components
            for usage in item.get("api_usage", [])
        ]
        level_ko = {
            "low": "낮음",
            "medium": "보통",
            "high": "높음",
            "very_high": "매우 높음",
        }.get(self.level, self.level)
        return {
            "title": "SupplyGuard SGRI 평가 결과",
            "score": round(clamp(self.score), 1),
            "level": self.level,
            "level_ko": level_ko,
            "confidence": round(clamp(self.confidence), 1),
            "generated_at": self.generated_at,
            "input_summary": self.input_summary,
            "weight_total": round(sum(component.weight for component in self.components.values()), 2),
            "weight_total_note": "가중치 합계는 1.00(100%)이 되도록 정규화되어 최종 SGRI 점수는 0~100점 범위로 산출됩니다.",
            "weight_profile": self.weight_profile,
            "calculation": " + ".join(
                f"{item['key']} {item['score']} x {item['weight']:.2f} = {item['weighted_score']}"
                for item in ordered_components
            ),
            "api_usage_summary": api_usage_summary,
            "components": ordered_components,
            "recommendations": self.recommendations,
            "rag_report": self.rag_report,
        }


def today_iso() -> str:
    return date.today().isoformat()
