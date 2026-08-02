from pydantic import BaseModel, ConfigDict, Field


class AlertSettingPayload(BaseModel):
    high_risk: bool = True
    news: bool = True
    monthly_report: bool = True
    high_threshold: int = Field(default=70, ge=0, le=100)


class AlertSettingOut(AlertSettingPayload):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
