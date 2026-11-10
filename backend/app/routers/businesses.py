from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.business import Business, BusinessMembership, RoleEnum
from app.models.user import User
from app.schemas.business import (
    BusinessOut, BusinessUpdate, StaffInvite, StaffUpdate, StaffPasswordReset, MembershipOut
)
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.auth_service import hash_password

router = APIRouter(prefix="/businesses", tags=["Business Workspace"])

@router.get("/profile", response_model=BusinessOut)
def get_business_profile(ctx: TenantContext = Depends(get_tenant_context)):
    return ctx.business

@router.put("/profile", response_model=BusinessOut)
def update_business_profile(
    data: BusinessUpdate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    b = ctx.business
    for key, val in data.dict(exclude_unset=True).items():
        setattr(b, key, val)
    db.commit()
    db.refresh(b)

    record_audit_log(
        db=db,
        business_id=b.id,
        user_id=ctx.user.id,
        action="UPDATE_BUSINESS_PROFILE",
        entity_type="business",
        entity_id=str(b.id),
        details=data.dict(exclude_unset=True)
    )
    return b

@router.get("/staff", response_model=List[MembershipOut])
def list_business_staff(
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    memberships = db.query(BusinessMembership).filter(
        BusinessMembership.business_id == ctx.business.id
    ).all()

    results = []
    for m in memberships:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            results.append(MembershipOut(
                id=m.id,
                user_id=u.id,
                full_name=u.full_name,
                email=u.email,
                phone=u.phone,
                role=m.role,
                is_active=m.is_active,
                created_at=m.created_at
            ))
    return results

@router.post("/staff", response_model=MembershipOut)
def invite_staff_member(
    invite: StaffInvite,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER])),
    db: Session = Depends(get_db)
):
    # If phone is provided, ensure it's not already linked to another email
    if invite.phone:
        existing_phone_user = db.query(User).filter(
            User.phone == invite.phone,
            User.email != invite.email.lower()
        ).first()
        if existing_phone_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phone number {invite.phone} is already linked to another account."
            )

    # Check if user already exists
    user = db.query(User).filter(User.email == invite.email.lower()).first()
    if not user:
        user = User(
            email=invite.email.lower(),
            full_name=invite.full_name,
            phone=invite.phone,
            hashed_password=hash_password(invite.temp_password),
            is_active=True
        )
        db.add(user)
        db.flush()
    else:
        if invite.phone and not user.phone:
            user.phone = invite.phone
            db.flush()

    # Check if already a member
    existing_m = db.query(BusinessMembership).filter(
        BusinessMembership.business_id == ctx.business.id,
        BusinessMembership.user_id == user.id
    ).first()
    if existing_m:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already an employee/member of this shop"
        )

    new_m = BusinessMembership(
        business_id=ctx.business.id,
        user_id=user.id,
        role=invite.role,
        is_active=True
    )
    db.add(new_m)
    db.commit()
    db.refresh(new_m)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="INVITE_STAFF",
        entity_type="user",
        entity_id=str(user.id),
        details={"invited_email": invite.email, "role": invite.role.value, "phone": invite.phone}
    )

    return MembershipOut(
        id=new_m.id,
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        role=new_m.role,
        is_active=new_m.is_active,
        created_at=new_m.created_at
    )

@router.put("/staff/{membership_id}", response_model=MembershipOut)
def update_staff_member(
    membership_id: int,
    data: StaffUpdate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER])),
    db: Session = Depends(get_db)
):
    m = db.query(BusinessMembership).filter(
        BusinessMembership.id == membership_id,
        BusinessMembership.business_id == ctx.business.id
    ).first()
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff membership record not found."
        )

    # Protection: if demoting from OWNER or deactivating an OWNER, ensure at least one active OWNER remains
    if (data.role and data.role != RoleEnum.OWNER and m.role == RoleEnum.OWNER) or (data.is_active is False and m.role == RoleEnum.OWNER):
        other_owners = db.query(BusinessMembership).filter(
            BusinessMembership.business_id == ctx.business.id,
            BusinessMembership.role == RoleEnum.OWNER,
            BusinessMembership.is_active == True,
            BusinessMembership.id != m.id
        ).count()
        if other_owners == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote or deactivate the only active Owner of this store."
            )

    if data.role is not None:
        m.role = data.role
    if data.is_active is not None:
        m.is_active = data.is_active

    db.commit()
    db.refresh(m)

    u = db.query(User).filter(User.id == m.user_id).first()

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="UPDATE_STAFF",
        entity_type="membership",
        entity_id=str(m.id),
        details={"target_user_id": m.user_id, "new_role": m.role.value, "is_active": m.is_active}
    )

    return MembershipOut(
        id=m.id,
        user_id=u.id,
        full_name=u.full_name,
        email=u.email,
        phone=u.phone,
        role=m.role,
        is_active=m.is_active,
        created_at=m.created_at
    )

@router.post("/staff/{membership_id}/reset-password")
def reset_staff_password(
    membership_id: int,
    data: StaffPasswordReset,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER])),
    db: Session = Depends(get_db)
):
    if len(data.new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password or PIN must be at least 4 characters/digits."
        )

    m = db.query(BusinessMembership).filter(
        BusinessMembership.id == membership_id,
        BusinessMembership.business_id == ctx.business.id
    ).first()
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff membership record not found."
        )

    u = db.query(User).filter(User.id == m.user_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    u.hashed_password = hash_password(data.new_password)
    db.commit()

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="RESET_STAFF_PASSWORD",
        entity_type="user",
        entity_id=str(u.id),
        details={"target_user_email": u.email, "role": m.role.value}
    )

    return {"message": f"Login credentials / PIN for {u.full_name} have been reset successfully."}

@router.delete("/staff/{membership_id}")
def remove_staff_member(
    membership_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER])),
    db: Session = Depends(get_db)
):
    m = db.query(BusinessMembership).filter(
        BusinessMembership.id == membership_id,
        BusinessMembership.business_id == ctx.business.id
    ).first()
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff membership record not found."
        )

    if m.user_id == ctx.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own active owner membership from the store."
        )

    if m.role == RoleEnum.OWNER:
        other_owners = db.query(BusinessMembership).filter(
            BusinessMembership.business_id == ctx.business.id,
            BusinessMembership.role == RoleEnum.OWNER,
            BusinessMembership.id != m.id
        ).count()
        if other_owners == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the only Owner of this store."
            )

    user_id = m.user_id
    u = db.query(User).filter(User.id == user_id).first()
    user_name = u.full_name if u else f"User #{user_id}"

    db.delete(m)
    db.commit()

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="REMOVE_STAFF",
        entity_type="membership",
        entity_id=str(membership_id),
        details={"removed_user_id": user_id, "removed_name": user_name}
    )

    return {"message": f"{user_name} has been removed from this store."}
