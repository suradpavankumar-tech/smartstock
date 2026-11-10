from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.schemas.agent import (
    AgentCapabilitiesOut,
    AgentChatRequest,
    AgentChatResponse,
)
from app.services.agent_service import (
    get_agent_capabilities,
    handle_agent_message,
)

router = APIRouter(prefix="/agent", tags=["AI Agent & Chatbot"])


@router.get("/capabilities", response_model=AgentCapabilitiesOut)
def read_agent_capabilities(
    ctx: TenantContext = Depends(get_tenant_context),
):
    return get_agent_capabilities(ctx=ctx)


@router.post("/chat", response_model=AgentChatResponse)
def chat_with_agent(
    req: AgentChatRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    return handle_agent_message(
        db=db,
        ctx=ctx,
        message=req.message,
        history=req.history,
        language=req.language,
    )
