from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.assistant import AssistantQueryRequest, AssistantQueryResponse
from app.dependencies import get_tenant_context, TenantContext
from app.services.assistant_service import answer_business_question

router = APIRouter(prefix="/assistant", tags=["Ask Your Business Assistant"])

@router.post("/query", response_model=AssistantQueryResponse)
def ask_business_assistant(
    req: AssistantQueryRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return answer_business_question(
        db=db,
        business_id=ctx.business.id,
        query=req.query
    )
