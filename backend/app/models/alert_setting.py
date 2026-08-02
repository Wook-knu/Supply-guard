from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AlertSetting(Base):
    __tablename__ = "alert_settings"
    __table_args__ = (CheckConstraint("high_threshold BETWEEN 0 AND 100", name="ck_alert_settings_threshold"),)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    high_risk: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    news: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    monthly_report: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    high_threshold: Mapped[int] = mapped_column(Integer, default=70, server_default="70")
