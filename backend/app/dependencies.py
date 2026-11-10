from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional, List, NamedTuple
import json

from app.database import get_db
from app.models.user import User
from app.models.business import Business, BusinessMembership, RoleEnum
from app.models.audit import AuditLog
from app.services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

class TenantContext(NamedTuple):
    user: User
    business: Business
    membership: BusinessMembership

def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception
    try:
        user_id = int(user_id_str)
    except ValueError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception
    return user

def get_tenant_context(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_business_id: Optional[str] = Header(None, alias="X-Business-ID")
) -> TenantContext:
    # 1. Determine target business_id
    target_business_id: Optional[int] = None
    
    # Header takes precedence if provided and valid
    if x_business_id and x_business_id.isdigit():
        target_business_id = int(x_business_id)
    else:
        # Check token payload
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = decode_access_token(token)
            if payload and payload.get("business_id"):
                target_business_id = int(payload.get("business_id"))

    # 2. If not specified, look for user's businesses
    memberships = db.query(BusinessMembership).filter(
        BusinessMembership.user_id == current_user.id,
        BusinessMembership.is_active == True
    ).all()

    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to any active business workspace"
        )

    membership: Optional[BusinessMembership] = None
    if target_business_id:
        membership = next((m for m in memberships if m.business_id == target_business_id), None)
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not an authorized member of this shop"
            )
    else:
        # Default to the first active business
        membership = memberships[0]

    business = db.query(Business).filter(
        Business.id == membership.business_id,
        Business.is_active == True
    ).first()

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shop profile not found or inactive"
        )

    return TenantContext(user=current_user, business=business, membership=membership)

def require_roles(allowed_roles: List[RoleEnum]):
    def role_checker(context: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if context.membership.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of the following roles: {[r.value for r in allowed_roles]}"
            )
        return context
    return role_checker

def record_audit_log(
    db: Session,
    business_id: int,
    user_id: Optional[int],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None
):
    try:
        log_entry = AuditLog(
            business_id=business_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            details_json=json.dumps(details) if details else None,
            ip_address=ip_address
        )
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()
