from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import Response
import csv
import io
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from typing import List, Optional

from app.database import get_db
from app.models.product import Product, Category, ProductBatch
from app.models.purchase import Supplier
from app.models.business import RoleEnum
from app.models.inventory import MovementTypeEnum
from app.schemas.product import ProductCreate, ProductUpdate, ProductOut, ProductImportResult
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.inventory_service import record_stock_movement
from app.services.import_export_service import parse_and_validate_products_csv, execute_products_import

router = APIRouter(prefix="/products", tags=["Products & Catalogue"])

@router.get("/", response_model=List[ProductOut])
def list_products(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    section_name: Optional[str] = None,
    low_stock_only: bool = False,
    include_archived: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Product).filter(Product.business_id == ctx.business.id)

    if not include_archived:
        query = query.filter(Product.is_archived == False)

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_fmt),
                Product.sku.ilike(search_fmt),
                Product.barcode.ilike(search_fmt)
            )
        )

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if section_name:
        query = query.join(Category, Category.id == Product.category_id).filter(
            Category.section_name == section_name
        )

    if low_stock_only:
        query = query.filter(Product.current_stock <= Product.reorder_threshold)

    products = query.order_by(Product.name).offset(skip).limit(limit).all()

    results = []
    for p in products:
        out = ProductOut.from_orm(p)
        out.category_name = p.category.name if p.category else None
        out.section_name = p.category.section_name if p.category else None
        out.supplier_name = p.supplier.name if p.supplier else None
        out.is_low_stock = p.current_stock <= p.reorder_threshold
        results.append(out)
    return results

@router.post("/", response_model=ProductOut)
def create_product(
    data: ProductCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    # Check duplicate SKU or barcode within this business
    if data.sku:
        dup = db.query(Product).filter(
            Product.business_id == ctx.business.id,
            Product.sku == data.sku,
            Product.is_archived == False
        ).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with SKU '{data.sku}' already exists ({dup.name})"
            )
    if data.barcode:
        dup_bc = db.query(Product).filter(
            Product.business_id == ctx.business.id,
            Product.barcode == data.barcode,
            Product.is_archived == False
        ).first()
        if dup_bc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with barcode '{data.barcode}' already exists ({dup_bc.name})"
            )

    product = Product(
        business_id=ctx.business.id,
        name=data.name.strip(),
        description=data.description,
        sku=data.sku.strip() if data.sku else None,
        barcode=data.barcode.strip() if data.barcode else None,
        category_id=data.category_id,
        supplier_id=data.supplier_id,
        unit=data.unit.lower().strip(),
        purchase_cost=data.purchase_cost,
        selling_price=data.selling_price,
        tax_rate_percent=data.tax_rate_percent,
        current_stock=0.0,
        reorder_threshold=data.reorder_threshold,
        min_order_qty=data.min_order_qty
    )
    db.add(product)
    db.flush()

    # Record verified opening stock if provided
    if data.initial_stock > 0:
        record_stock_movement(
            db=db,
            business_id=ctx.business.id,
            product_id=product.id,
            movement_type=MovementTypeEnum.OPENING_STOCK,
            quantity=data.initial_stock,
            unit_cost=data.purchase_cost,
            reason="Initial Opening Stock",
            user_id=ctx.user.id
        )

    # Record batch if provided
    if data.batch_number:
        batch = ProductBatch(
            business_id=ctx.business.id,
            product_id=product.id,
            batch_number=data.batch_number.strip(),
            quantity=data.initial_stock,
            purchase_cost=data.purchase_cost,
            expiry_date=data.expiry_date
        )
        db.add(batch)

    db.commit()
    db.refresh(product)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="CREATE_PRODUCT",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name, "initial_stock": data.initial_stock}
    )

    out = ProductOut.from_orm(product)
    out.category_name = product.category.name if product.category else None
    out.section_name = product.category.section_name if product.category else None
    out.supplier_name = product.supplier.name if product.supplier else None
    out.is_low_stock = product.current_stock <= product.reorder_threshold
    return out

@router.get("/export/csv")
def export_products_csv(
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    products = db.query(Product).filter(
        Product.business_id == ctx.business.id,
        Product.is_archived == False
    ).order_by(Product.name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "name", "barcode", "sku", "category", "unit",
        "purchase_cost", "selling_price", "tax_rate_percent",
        "current_stock", "reorder_threshold", "min_order_qty"
    ])
    for p in products:
        writer.writerow([
            p.id,
            p.name,
            p.barcode or "",
            p.sku or "",
            p.category.name if p.category else "General",
            p.unit,
            p.purchase_cost,
            p.selling_price,
            p.tax_rate_percent,
            p.current_stock,
            p.reorder_threshold,
            p.min_order_qty
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=smartstock_products_{ctx.business.id}.csv"}
    )

@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.business_id == ctx.business.id
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    out = ProductOut.from_orm(product)
    out.category_name = product.category.name if product.category else None
    out.section_name = product.category.section_name if product.category else None
    out.supplier_name = product.supplier.name if product.supplier else None
    out.is_low_stock = product.current_stock <= product.reorder_threshold
    return out

@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.business_id == ctx.business.id
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for k, v in data.dict(exclude_unset=True).items():
        setattr(product, k, v)
    db.commit()
    db.refresh(product)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="UPDATE_PRODUCT",
        entity_type="product",
        entity_id=str(product.id),
        details=data.dict(exclude_unset=True)
    )

    out = ProductOut.from_orm(product)
    out.category_name = product.category.name if product.category else None
    out.section_name = product.category.section_name if product.category else None
    out.supplier_name = product.supplier.name if product.supplier else None
    out.is_low_stock = product.current_stock <= product.reorder_threshold
    return out

@router.delete("/{product_id}")
def archive_product(
    product_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.business_id == ctx.business.id
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    product.is_archived = True
    db.commit()

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="ARCHIVE_PRODUCT",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name}
    )
    return {"message": f"Product '{product.name}' archived successfully"}

@router.post("/import/preview")
async def preview_csv_import(
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER]))
):
    content = await file.read()
    valid_rows, rejected_rows = parse_and_validate_products_csv(content)
    return {
        "filename": file.filename,
        "total_parsed": len(valid_rows) + len(rejected_rows),
        "valid_count": len(valid_rows),
        "rejected_count": len(rejected_rows),
        "valid_preview": valid_rows[:10],
        "rejected_rows": rejected_rows
    }

@router.post("/import/execute", response_model=ProductImportResult)
async def execute_csv_import(
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    content = await file.read()
    valid_rows, parse_rejected = parse_and_validate_products_csv(content)
    imported_count, import_rejected = execute_products_import(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        valid_rows=valid_rows
    )

    all_rejected = parse_rejected + import_rejected

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="IMPORT_PRODUCTS_CSV",
        entity_type="product",
        details={
            "total_rows": len(valid_rows) + len(parse_rejected),
            "imported": imported_count,
            "rejected": len(all_rejected)
        }
    )

    return ProductImportResult(
        total_rows=len(valid_rows) + len(parse_rejected),
        imported_count=imported_count,
        rejected_count=len(all_rejected),
        rejected_rows=all_rejected
    )
