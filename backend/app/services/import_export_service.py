import csv
import io
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple
from datetime import datetime

from app.models.product import Product, Category
from app.models.inventory import MovementTypeEnum
from app.services.inventory_service import record_stock_movement

def parse_and_validate_products_csv(
    file_content: bytes
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses CSV and returns (valid_rows, rejected_rows).
    """
    text = file_content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    
    valid_rows = []
    rejected_rows = []

    row_index = 1
    for row in reader:
        row_index += 1
        name = row.get("name") or row.get("Name") or row.get("product_name") or row.get("Product Name")
        if not name or not name.strip():
            rejected_rows.append({
                "row_number": row_index,
                "raw_data": row,
                "reason": "Missing required field: 'name'"
            })
            continue

        name = name.strip()
        prod_id = None
        raw_id = row.get("id") or row.get("ID") or row.get("product_id")
        if raw_id and str(raw_id).strip():
            try:
                prod_id = int(str(raw_id).strip())
            except ValueError:
                prod_id = None

        sku = (row.get("sku") or row.get("SKU") or "").strip() or None
        barcode = (row.get("barcode") or row.get("Barcode") or "").strip() or None
        category_name = (row.get("category") or row.get("Category") or "General").strip()
        section_name = (row.get("section") or row.get("Section") or "General").strip()
        unit = (row.get("unit") or row.get("Unit") or "piece").strip().lower()

        try:
            selling_price = float(row.get("selling_price") or row.get("Selling Price") or row.get("price") or 0.0)
            if selling_price < 0:
                raise ValueError("Selling price cannot be negative")
        except ValueError as e:
            rejected_rows.append({
                "row_number": row_index,
                "raw_data": row,
                "reason": f"Invalid selling_price: {str(e)}"
            })
            continue

        try:
            purchase_cost = float(row.get("purchase_cost") or row.get("Purchase Cost") or row.get("cost") or 0.0)
            if purchase_cost < 0:
                raise ValueError("Purchase cost cannot be negative")
        except ValueError:
            purchase_cost = 0.0

        try:
            initial_stock = float(row.get("initial_stock") or row.get("Initial Stock") or row.get("stock") or 0.0)
        except ValueError:
            initial_stock = 0.0

        try:
            reorder_threshold = float(row.get("reorder_threshold") or row.get("Reorder Threshold") or 10.0)
        except ValueError:
            reorder_threshold = 10.0

        try:
            min_order_qty = float(row.get("min_order_qty") or row.get("Min Order Qty") or 5.0)
        except ValueError:
            min_order_qty = 5.0

        try:
            tax_rate = float(row.get("tax_rate_percent") or row.get("Tax Rate") or row.get("gst") or 0.0)
        except ValueError:
            tax_rate = 0.0

        valid_rows.append({
            "id": prod_id,
            "name": name,
            "sku": sku,
            "barcode": barcode,
            "category_name": category_name,
            "section_name": section_name,
            "unit": unit,
            "selling_price": selling_price,
            "purchase_cost": purchase_cost,
            "initial_stock": initial_stock,
            "reorder_threshold": reorder_threshold,
            "min_order_qty": min_order_qty,
            "tax_rate_percent": tax_rate,
            "row_number": row_index
        })

    return valid_rows, rejected_rows

def execute_products_import(
    db: Session,
    business_id: int,
    user_id: int,
    valid_rows: List[Dict[str, Any]]
) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Imports valid product rows transactionally into the database.
    """
    imported_count = 0
    rejected_rows = []

    # Cache categories for this business
    categories = db.query(Category).filter(Category.business_id == business_id).all()
    cat_map = {c.name.lower(): c for c in categories}

    for row in valid_rows:
        row_num = row["row_number"]
        name = row["name"]
        sku = row["sku"]
        barcode = row["barcode"]
        prod_id = row.get("id")

        # Check if product exists by ID, Barcode, or SKU to update instead of erroring
        query = db.query(Product).filter(
            Product.business_id == business_id,
            Product.is_archived == False
        )
        existing_product = None
        if prod_id:
            existing_product = query.filter(Product.id == prod_id).first()
        if not existing_product and barcode:
            existing_product = query.filter(Product.barcode == barcode).first()
        if not existing_product and sku:
            existing_product = query.filter(Product.sku == sku).first()

        if existing_product:
            # Update existing product in place
            if name:
                existing_product.name = name
            existing_product.selling_price = row["selling_price"]
            if row.get("purchase_cost") is not None and row["purchase_cost"] > 0:
                existing_product.purchase_cost = row["purchase_cost"]
            if row.get("tax_rate_percent") is not None:
                existing_product.tax_rate_percent = row["tax_rate_percent"]
            if row.get("reorder_threshold") is not None:
                existing_product.reorder_threshold = row["reorder_threshold"]
            if row.get("min_order_qty") is not None:
                existing_product.min_order_qty = row["min_order_qty"]

            # Adjust stock if difference provided
            if "initial_stock" in row and row["initial_stock"] is not None:
                new_stock = float(row["initial_stock"])
                stock_diff = new_stock - existing_product.current_stock
                if abs(stock_diff) > 0.001:
                    record_stock_movement(
                        db=db,
                        business_id=business_id,
                        product_id=existing_product.id,
                        movement_type=MovementTypeEnum.AUDIT_CORRECTION,
                        quantity=stock_diff,
                        unit_cost=existing_product.purchase_cost,
                        reference_type="csv_bulk_update",
                        reference_id=f"row_{row_num}",
                        reason="CSV Bulk Stock Adjustment",
                        user_id=user_id
                    )
            imported_count += 1
            continue

        # If brand new product, verify no duplicates for SKU/barcode
        if sku:
            dup_sku = query.filter(Product.sku == sku).first()
            if dup_sku:
                rejected_rows.append({
                    "row_number": row_num,
                    "product_name": name,
                    "reason": f"Duplicate SKU '{sku}' already exists on product '{dup_sku.name}'"
                })
                continue
        if barcode:
            dup_bc = query.filter(Product.barcode == barcode).first()
            if dup_bc:
                rejected_rows.append({
                    "row_number": row_num,
                    "product_name": name,
                    "reason": f"Duplicate Barcode '{barcode}' already exists on product '{dup_bc.name}'"
                })
                continue

        # Get or create category
        cat_key = row["category_name"].lower()
        if cat_key in cat_map:
            cat = cat_map[cat_key]
        else:
            cat = Category(
                business_id=business_id,
                name=row["category_name"],
                section_name=row["section_name"]
            )
            db.add(cat)
            db.flush()
            cat_map[cat_key] = cat

        product = Product(
            business_id=business_id,
            name=name,
            sku=sku,
            barcode=barcode,
            category_id=cat.id,
            unit=row["unit"],
            purchase_cost=row["purchase_cost"],
            selling_price=row["selling_price"],
            tax_rate_percent=row["tax_rate_percent"],
            current_stock=0.0,  # will be set via stock movement
            reorder_threshold=row["reorder_threshold"],
            min_order_qty=row["min_order_qty"]
        )
        db.add(product)
        db.flush()

        # Record opening stock if > 0
        if row["initial_stock"] > 0:
            record_stock_movement(
                db=db,
                business_id=business_id,
                product_id=product.id,
                movement_type=MovementTypeEnum.OPENING_STOCK,
                quantity=row["initial_stock"],
                unit_cost=row["purchase_cost"],
                reference_type="import",
                reference_id=f"row_{row_num}",
                reason="Verified Opening Stock CSV Import",
                user_id=user_id
            )

        imported_count += 1

    db.commit()
    return imported_count, rejected_rows
