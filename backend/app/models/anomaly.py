import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class AnomalySeverityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class AnomalyStatusEnum(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"

class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    alert_type = Column(String(100), nullable=False)  # REPEATED_CANCELLATION, EXCESSIVE_DISCOUNT, LARGE_STOCK_ADJUSTMENT, NEGATIVE_STOCK_ATTEMPT, UNUSUAL_RETURN
    severity = Column(Enum(AnomalySeverityEnum), default=AnomalySeverityEnum.MEDIUM, nullable=False)
    description = Column(Text, nullable=False)
    entity_type = Column(String(50), nullable=True)  # invoice, stock_movement, product
    entity_id = Column(String(100), nullable=True)
    status = Column(Enum(AnomalyStatusEnum), default=AnomalyStatusEnum.PENDING_REVIEW, nullable=False)
    resolution_notes = Column(Text, nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    reviewed_at = Column(DateTime, nullable=True)

    business = relationship("Business", back_populates="anomaly_alerts")
    reviewed_by = relationship("User")
