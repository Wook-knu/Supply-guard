"""
국가별 SGRI 조회 응답 스키마.
"""
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field


class RiskScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    country_code: str
    hs_code: str | None = None
    as_of_date: date
    score_s: Decimal | None = None
    score_c: Decimal | None = None
    score_v: Decimal | None = None
    score_l: Decimal | None = None
    score_p: Decimal | None = None
    score_e: Decimal | None = None
    sgri_score: Decimal

    @computed_field
    @property
    def level(self) -> str:
        """SGRI 점수를 위험 수준 라벨로 변환 (프론트 '높음/중간/낮음' 배지용)."""
        s = float(self.sgri_score)
        if s >= 50:
            return "높음"
        if s >= 25:
            return "중간"
        return "낮음"
