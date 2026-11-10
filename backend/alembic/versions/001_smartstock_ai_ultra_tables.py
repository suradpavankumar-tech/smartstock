"""Create SmartStock AI Ultra persistence tables

Revision ID: 001_ai_ultra
Revises:
Create Date: 2026-11-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

from app.models.ai import (
    AIConversation,
    AIMessage,
    AITask,
    AIAgentExecution,
    AIToolExecution,
    AIApproval,
    AIMemory,
    AIWorkflow,
    AIAlert,
    AIDocument,
    AIEvaluation,
)

revision: str = "001_ai_ultra"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AI_TABLES = [
    AIConversation.__table__,
    AIMessage.__table__,
    AITask.__table__,
    AIAgentExecution.__table__,
    AIToolExecution.__table__,
    AIApproval.__table__,
    AIMemory.__table__,
    AIWorkflow.__table__,
    AIAlert.__table__,
    AIDocument.__table__,
    AIEvaluation.__table__,
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in AI_TABLES:
        if not inspector.has_table(table.name):
            table.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in reversed(AI_TABLES):
        if inspector.has_table(table.name):
            table.drop(bind=bind, checkfirst=True)
