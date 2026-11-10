from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from app.database import get_db
from app.models.user import User
from app.models.business import Business, BusinessMembership, RoleEnum
from app.schemas.auth import UserRegister, UserLogin, Token, UserOut, BusinessSummary, AuthStatus, SwitchBusinessRequest
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.dependencies import get_current_user, record_audit_log

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Token)
def register_owner_and_business(data: UserRegister, db: Session = Depends(get_db)):
    # 1. Check if email already registered
    existing_user = db.query(User).filter(User.email == data.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )

    # 2. Create User
    new_user = User(
        email=data.email.lower(),
        phone=data.phone,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        is_active=True
    )
    db.add(new_user)
    db.flush()

    # 3. Create Business Workspace
    new_business = Business(
        name=data.business_name,
        gstin=data.gstin,
        phone=data.phone,
        email=data.email.lower(),
        city=data.city,
        district=data.district,
        state=data.state,
        currency="INR",
        timezone="Asia/Kolkata",
        locale="kn-IN",
        is_active=True
    )
    db.add(new_business)
    db.flush()

    # 4. Associate as OWNER
    membership = BusinessMembership(
        user_id=new_user.id,
        business_id=new_business.id,
        role=RoleEnum.OWNER,
        is_active=True
    )
    db.add(membership)
    db.commit()

    record_audit_log(
        db=db,
        business_id=new_business.id,
        user_id=new_user.id,
        action="REGISTER_BUSINESS",
        entity_type="business",
        entity_id=str(new_business.id),
        details={"business_name": new_business.name, "owner_email": new_user.email}
    )

    # 5. Issue JWT
    token_data = {
        "sub": str(new_user.id),
        "business_id": new_business.id,
        "role": RoleEnum.OWNER.value
    }
    access_token = create_access_token(token_data)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=new_user.id,
        business_id=new_business.id,
        role=RoleEnum.OWNER,
        business_name=new_business.name
    )

@router.post("/login", response_model=Token)
def login_user(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact platform support."
        )

    # Find user's active business memberships
    memberships = db.query(BusinessMembership).filter(
        BusinessMembership.user_id == user.id,
        BusinessMembership.is_active == True
    ).all()

    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active shop workspace associated with this account"
        )

    # By default, open the user's primary/first business immediately
    primary_membership = memberships[0]
    business = db.query(Business).filter(Business.id == primary_membership.business_id).first()

    token_data = {
        "sub": str(user.id),
        "business_id": primary_membership.business_id,
        "role": primary_membership.role.value
    }
    access_token = create_access_token(token_data)

    record_audit_log(
        db=db,
        business_id=primary_membership.business_id,
        user_id=user.id,
        action="LOGIN",
        entity_type="user",
        entity_id=str(user.id),
        details={"email": user.email}
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        business_id=primary_membership.business_id,
        role=primary_membership.role,
        business_name=business.name if business else "SmartStock"
    )

@router.post("/switch-business", response_model=Token)
def switch_active_business(
    req: SwitchBusinessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(BusinessMembership).filter(
        BusinessMembership.user_id == current_user.id,
        BusinessMembership.business_id == req.business_id,
        BusinessMembership.is_active == True
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to switch to this business workspace"
        )

    business = db.query(Business).filter(Business.id == req.business_id).first()
    token_data = {
        "sub": str(current_user.id),
        "business_id": business.id,
        "role": membership.role.value
    }
    access_token = create_access_token(token_data)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=current_user.id,
        business_id=business.id,
        role=membership.role,
        business_name=business.name
    )

@router.get("/me", response_model=AuthStatus)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(BusinessMembership).filter(
        BusinessMembership.user_id == current_user.id,
        BusinessMembership.is_active == True
    ).all()

    business_summaries = []
    for m in memberships:
        b = db.query(Business).filter(Business.id == m.business_id).first()
        if b and b.is_active:
            business_summaries.append(BusinessSummary(
                id=b.id,
                name=b.name,
                role=m.role,
                city=b.city,
                district=b.district,
                gstin=b.gstin
            ))

    current_summary = business_summaries[0] if business_summaries else None

    return AuthStatus(
        user=UserOut(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            phone=current_user.phone,
            is_active=current_user.is_active,
            is_superuser=current_user.is_superuser
        ),
        current_business=current_summary,
        businesses=business_summaries
    )
