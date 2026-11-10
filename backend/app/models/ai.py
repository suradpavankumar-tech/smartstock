from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


def utc_now() -> datetime:
    """Naive UTC timestamp helper without Python 3.14 deprecation warnings."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="New SmartStock AI Session")
    mode = Column(String(32), nullable=False, default="QUICK_ASSIST")
    language = Column(String(16), nullable=False, default="en")
    context_summary = Column(Text, nullable=True)
    last_message_at = Column(DateTime, default=utc_now, index=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan")


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    role = Column(String(24), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    mode = Column(String(32), nullable=False, default="QUICK_ASSIST")
    language = Column(String(16), nullable=False, default="en")
    intent = Column(String(80), nullable=True)
    confidence = Column(Float, default=1.0)
    response_payload_json = Column(Text, nullable=True)
    tokens_used = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now, index=True)

    conversation = relationship("AIConversation", back_populates="messages")


class AITask(Base):
    __tablename__ = "ai_tasks"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    message_id = Column(Integer, ForeignKey("ai_messages.id", ondelete="SET NULL"), nullable=True)
    mode = Column(String(32), nullable=False, default="QUICK_ASSIST")
    objective = Column(Text, nullable=False)
    intent = Column(String(80), nullable=True)
    status = Column(String(32), nullable=False, default="COMPLETED")
    plan_json = Column(Text, nullable=True)
    result_summary = Column(Text, nullable=True)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now, index=True)
    completed_at = Column(DateTime, nullable=True)

    agent_executions = relationship("AIAgentExecution", back_populates="task", cascade="all, delete-orphan")
    tool_executions = relationship("AIToolExecution", back_populates="task", cascade="all, delete-orphan")


class AIAgentExecution(Base):
    __tablename__ = "ai_agent_executions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("ai_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_name = Column(String(80), nullable=False)
    agent_role = Column(String(120), nullable=False)
    status = Column(String(32), nullable=False, default="COMPLETED")
    input_summary = Column(Text, nullable=True)
    output_summary = Column(Text, nullable=True)
    confidence = Column(Float, default=0.95)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)

    task = relationship("AITask", back_populates="agent_executions")


class AIToolExecution(Base):
    __tablename__ = "ai_tool_executions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("ai_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_name = Column(String(80), nullable=True)
    tool_name = Column(String(80), nullable=False)
    is_mutating = Column(Boolean, default=False)
    arguments_json = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="COMPLETED")
    result_summary = Column(Text, nullable=True)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)

    task = relationship("AITask", back_populates="tool_executions")


class AIApproval(Base):
    __tablename__ = "ai_approvals"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("ai_tasks.id", ondelete="SET NULL"), nullable=True)
    requested_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=False)
    preview_json = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=False)
    idempotency_key = Column(String(120), nullable=False)
    status = Column(String(32), nullable=False, default="PENDING", index=True)  # PENDING | APPROVED | REJECTED | EXECUTED | FAILED
    decision_note = Column(Text, nullable=True)
    execution_result_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, index=True)
    decided_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("business_id", "idempotency_key", name="uq_ai_approval_idempotency"),
    )


class AIMemory(Base):
    __tablename__ = "ai_memories"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    memory_key = Column(String(120), nullable=False, index=True)
    memory_value = Column(Text, nullable=False)
    category = Column(String(48), nullable=False, default="PREFERENCE")
    is_active = Column(Boolean, default=True)
    source = Column(String(32), nullable=False, default="USER_EXPLICIT")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class AIWorkflow(Base):
    __tablename__ = "ai_workflows"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(160), nullable=False)
    natural_language_rule = Column(Text, nullable=False)
    trigger_type = Column(String(32), nullable=False, default="SCHEDULED")  # SCHEDULED | EVENT | MANUAL
    schedule_cron = Column(String(80), nullable=True)
    condition_json = Column(Text, nullable=True)
    action_json = Column(Text, nullable=True)
    requires_approval = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_run_at = Column(DateTime, nullable=True)
    last_run_summary = Column(Text, nullable=True)
    run_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)


class AIAlert(Base):
    __tablename__ = "ai_alerts"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    alert_key = Column(String(160), nullable=False, index=True)
    category = Column(String(48), nullable=False, index=True)
    severity = Column(String(24), nullable=False, default="MEDIUM")  # LOW | MEDIUM | HIGH | CRITICAL
    title = Column(String(255), nullable=False)
    what_happened = Column(Text, nullable=False)
    why_it_matters = Column(Text, nullable=False)
    supporting_data_json = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=False)
    recommended_tab = Column(String(48), nullable=True)
    status = Column(String(24), nullable=False, default="ACTIVE", index=True)  # ACTIVE | ACKNOWLEDGED | RESOLVED | DISMISSED
    detected_at = Column(DateTime, default=utc_now, index=True)
    resolved_at = Column(DateTime, nullable=True)


class AIDocument(Base):
    __tablename__ = "ai_documents"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(120), nullable=False)
    document_type = Column(String(48), nullable=False, default="PURCHASE_INVOICE")
    file_size_bytes = Column(Integer, default=0)
    extraction_status = Column(String(32), nullable=False, default="PROCESSED")
    raw_excerpt = Column(Text, nullable=True)
    extracted_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, index=True)


class AIEvaluation(Base):
    __tablename__ = "ai_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    task_id = Column(Integer, ForeignKey("ai_tasks.id", ondelete="SET NULL"), nullable=True)
    suite_name = Column(String(80), nullable=False, default="runtime_turn")
    query = Column(Text, nullable=False)
    mode = Column(String(32), nullable=False, default="QUICK_ASSIST")
    expected_intent = Column(String(80), nullable=True)
    actual_intent = Column(String(80), nullable=True)
    passed = Column(Boolean, default=True)
    groundedness_score = Column(Float, default=1.0)
    latency_ms = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    details_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, index=True)
