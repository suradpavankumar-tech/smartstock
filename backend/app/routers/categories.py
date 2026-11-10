from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models.product import Category, Product
from app.models.business import RoleEnum
from app.schemas.product import CategoryCreate, CategoryUpdate, CategoryOut
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log

router = APIRouter(prefix="/categories", tags=["Categories & Sections"])

@router.get("/", response_model=List[CategoryOut])
def list_categories(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    categories = db.query(Category).filter(
        Category.business_id == ctx.business.id,
        Category.is_archived == False
    ).order_by(Category.section_name, Category.name).all()

    # Compute product counts
    counts = db.query(
        Product.category_id,
        func.count(Product.id).label("cnt")
    ).filter(
        Product.business_id == ctx.business.id,
        Product.is_archived == False
    ).group_by(Product.category_id).all()
    count_map = {c.category_id: c.cnt for c in counts}

    results = []
    for c in categories:
        out = CategoryOut.from_orm(c)
        out.product_count = count_map.get(c.id, 0)
        results.append(out)
    return results

@router.post("/", response_model=CategoryOut)
def create_category(
    data: CategoryCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    cat = Category(
        business_id=ctx.business.id,
        name=data.name.strip(),
        section_name=data.section_name.strip() if data.section_name else "General",
        description=data.description
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="CREATE_CATEGORY",
        entity_type="category",
        entity_id=str(cat.id),
        details={"name": cat.name, "section": cat.section_name}
    )
    return cat

@router.put("/{cat_id}", response_model=CategoryOut)
def update_category(
    cat_id: int,
    data: CategoryUpdate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.business_id == ctx.business.id
    ).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    for k, v in data.dict(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat

@router.delete("/{cat_id}")
def archive_category(
    cat_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.business_id == ctx.business.id
    ).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    cat.is_archived = True
    db.commit()
    return {"message": f"Category '{cat.name}' archived successfully"}
