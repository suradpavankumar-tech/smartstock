import io
import csv
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, distinct, cast, Date
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional

from app.models.invoice import Invoice, InvoiceItem, SalesReturn, InvoiceStatusEnum
from app.models.expense import Expense
from app.models.product import Product, Category
from app.models.customer import Customer
from app.models.inventory import StockMovement, MovementTypeEnum
from app.schemas.analytics import (
    FinancialSummaryOut,
    DailySalesPoint,
    ProductPerformancePoint,
    CategoryPerformancePoint,
    StockAgeingCohort,
    StockAgeingProduct,
    StockAgeingReportOut,
    Gstr1ReportOut,
    Gstr1Summary,
    Gstr1B2bItem,
    Gstr1B2csItem,
    Gstr1HsnItem
)

def get_financial_summary(
    db: Session,
    business_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> FinancialSummaryOut:
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    # 1. Invoice totals
    invoices_q = db.query(
        func.count(Invoice.id).label("inv_count"),
        func.coalesce(func.sum(Invoice.subtotal), 0.0).label("gross_sales"),
        func.coalesce(func.sum(Invoice.discount_amount), 0.0).label("discounts"),
        func.coalesce(func.sum(Invoice.total_cost), 0.0).label("cogs"),
        func.coalesce(func.sum(Invoice.total_amount), 0.0).label("total_billed")
    ).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED,
        Invoice.created_at >= start_dt,
        Invoice.created_at <= end_dt
    ).first()

    inv_count = invoices_q.inv_count or 0
    gross_sales = round(float(invoices_q.gross_sales or 0.0), 2)
    discounts = round(float(invoices_q.discounts or 0.0), 2)
    cogs = round(float(invoices_q.cogs or 0.0), 2)

    # 2. Sales Returns
    returns_sum = db.query(
        func.coalesce(func.sum(SalesReturn.refund_amount), 0.0)
    ).filter(
        SalesReturn.business_id == business_id,
        SalesReturn.created_at >= start_dt,
        SalesReturn.created_at <= end_dt
    ).scalar() or 0.0
    returns = round(float(returns_sum), 2)

    net_sales = max(0.0, round(gross_sales - discounts - returns, 2))
    gross_profit = round(net_sales - cogs, 2)
    gross_margin_percent = round((gross_profit / net_sales * 100.0), 2) if net_sales > 0 else 0.0
    avg_order_val = round(net_sales / inv_count, 2) if inv_count > 0 else 0.0

    # 3. Operating Expenses
    expenses_sum = db.query(
        func.coalesce(func.sum(Expense.amount), 0.0)
    ).filter(
        Expense.business_id == business_id,
        Expense.expense_date >= start_date,
        Expense.expense_date <= end_date
    ).scalar() or 0.0
    operating_expenses = round(float(expenses_sum), 2)
    operating_profit = round(gross_profit - operating_expenses, 2)

    # 4. Inventory Valuation & Units
    products = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_archived == False
    ).all()

    inventory_valuation = 0.0
    total_stock_units = 0.0
    low_stock_count = 0

    for p in products:
        units = max(0.0, p.current_stock)
        total_stock_units += units
        inventory_valuation += units * p.purchase_cost
        if p.current_stock <= p.reorder_threshold:
            low_stock_count += 1

    return FinancialSummaryOut(
        start_date=start_date,
        end_date=end_date,
        gross_sales=gross_sales,
        discounts=discounts,
        returns=returns,
        net_sales=net_sales,
        cost_of_goods_sold=cogs,
        gross_profit=gross_profit,
        gross_margin_percent=gross_margin_percent,
        operating_expenses=operating_expenses,
        operating_profit=operating_profit,
        total_invoices_count=inv_count,
        average_order_value=avg_order_val,
        inventory_valuation=round(inventory_valuation, 2),
        total_stock_units=round(total_stock_units, 2),
        low_stock_products_count=low_stock_count
    )

def get_daily_sales_trend(
    db: Session,
    business_id: int,
    days: int = 14
) -> List[DailySalesPoint]:
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time())

    invoices = db.query(Invoice).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED,
        Invoice.created_at >= start_dt
    ).all()

    # Aggregate by date
    daily_map: Dict[str, Dict[str, float]] = {}
    curr = start_date
    while curr <= end_date:
        d_str = curr.strftime("%Y-%m-%d")
        daily_map[d_str] = {"sales": 0.0, "cost": 0.0, "profit": 0.0, "invoices": 0}
        curr += timedelta(days=1)

    for inv in invoices:
        d_str = inv.created_at.strftime("%Y-%m-%d")
        if d_str in daily_map:
            net_inv = inv.subtotal - inv.discount_amount
            daily_map[d_str]["sales"] += net_inv
            daily_map[d_str]["cost"] += inv.total_cost
            daily_map[d_str]["profit"] += (net_inv - inv.total_cost)
            daily_map[d_str]["invoices"] += 1

    result = []
    for d_str, data in sorted(daily_map.items()):
        result.append(DailySalesPoint(
            date=d_str,
            sales=round(data["sales"], 2),
            cost=round(data["cost"], 2),
            profit=round(data["profit"], 2),
            invoices=data["invoices"]
        ))
    return result

def get_product_performance(
    db: Session,
    business_id: int,
    limit: int = 10,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    sort_by: str = "revenue",
) -> List[ProductPerformancePoint]:
    q = (
        db.query(
            InvoiceItem.product_id,
            InvoiceItem.product_name,
            func.sum(InvoiceItem.quantity).label("units_sold"),
            func.sum(InvoiceItem.total_amount).label("revenue"),
            func.sum(InvoiceItem.total_cost).label("cost"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(
            Invoice.business_id == business_id,
            Invoice.status == InvoiceStatusEnum.COMPLETED,
        )
    )
    if start_date is not None:
        q = q.filter(Invoice.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date is not None:
        q = q.filter(Invoice.created_at <= datetime.combine(end_date, datetime.max.time()))

    order_expr = (
        func.sum(InvoiceItem.quantity).desc()
        if sort_by == "units_sold"
        else func.sum(InvoiceItem.total_amount).desc()
    )
    items = (
        q.group_by(InvoiceItem.product_id, InvoiceItem.product_name)
        .order_by(order_expr, func.sum(InvoiceItem.total_amount).desc())
        .limit(limit)
        .all()
    )

    results = []
    for item in items:
        rev = round(float(item.revenue or 0.0), 2)
        cst = round(float(item.cost or 0.0), 2)
        profit = round(rev - cst, 2)
        margin = round((profit / rev * 100.0), 2) if rev > 0 else 0.0
        results.append(ProductPerformancePoint(
            product_id=item.product_id,
            product_name=item.product_name,
            units_sold=round(float(item.units_sold or 0.0), 2),
            revenue=rev,
            cost=cst,
            gross_profit=profit,
            margin_percent=margin
        ))
    return results

def get_category_performance(
    db: Session,
    business_id: int
) -> List[CategoryPerformancePoint]:
    categories = db.query(Category).filter(
        Category.business_id == business_id
    ).all()

    cat_map = {c.id: c.name for c in categories}
    cat_map[None] = "Uncategorized"

    # Query items grouped by product's category_id
    rows = db.query(
        Product.category_id,
        func.sum(InvoiceItem.quantity).label("units_sold"),
        func.sum(InvoiceItem.total_amount).label("revenue")
    ).join(InvoiceItem, InvoiceItem.product_id == Product.id)\
     .join(Invoice, Invoice.id == InvoiceItem.invoice_id)\
     .filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED
    ).group_by(Product.category_id).all()

    total_revenue = sum(float(r.revenue or 0.0) for r in rows)
    results = []
    for r in rows:
        rev = round(float(r.revenue or 0.0), 2)
        pct = round((rev / total_revenue * 100.0), 2) if total_revenue > 0 else 0.0
        results.append(CategoryPerformancePoint(
            category_id=r.category_id,
            category_name=cat_map.get(r.category_id, "General"),
            units_sold=round(float(r.units_sold or 0.0), 2),
            revenue=rev,
            revenue_percentage=pct
        ))
    return results

def get_stock_ageing_report(
    db: Session,
    business_id: int
) -> StockAgeingReportOut:
    today = date.today()
    products = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_archived == False
    ).all()

    # Pre-fetch latest sale date per product
    latest_sales = db.query(
        InvoiceItem.product_id,
        func.max(Invoice.created_at).label("last_sale")
    ).join(Invoice, Invoice.id == InvoiceItem.invoice_id).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED
    ).group_by(InvoiceItem.product_id).all()

    last_sale_map = {r.product_id: r.last_sale.date() for r in latest_sales if r.last_sale}

    cohorts_dict = {
        "0-30 Days (Active)": {"count": 0, "units": 0.0, "value": 0.0},
        "31-60 Days (Slow)": {"count": 0, "units": 0.0, "value": 0.0},
        "61-90 Days (Dormant)": {"count": 0, "units": 0.0, "value": 0.0},
        "90+ Days (Dead Stock)": {"count": 0, "units": 0.0, "value": 0.0}
    }

    slow_dead_products = []
    total_dead_stock_value = 0.0

    for p in products:
        units = max(0.0, p.current_stock)
        val = round(units * p.purchase_cost, 2)
        
        last_date = last_sale_map.get(p.id)
        if last_date:
            days_inactive = (today - last_date).days
        else:
            days_inactive = (today - p.created_at.date()).days

        if days_inactive <= 30:
            cohort_key = "0-30 Days (Active)"
            status_str = "ACTIVE"
        elif days_inactive <= 60:
            cohort_key = "31-60 Days (Slow)"
            status_str = "SLOW"
        elif days_inactive <= 90:
            cohort_key = "61-90 Days (Dormant)"
            status_str = "DORMANT"
        else:
            cohort_key = "90+ Days (Dead Stock)"
            status_str = "DEAD"
            total_dead_stock_value += val

        cohorts_dict[cohort_key]["count"] += 1
        cohorts_dict[cohort_key]["units"] += units
        cohorts_dict[cohort_key]["value"] += val

        if status_str in ("SLOW", "DORMANT", "DEAD") and units > 0:
            slow_dead_products.append(StockAgeingProduct(
                product_id=p.id,
                product_name=p.name,
                current_stock=units,
                unit_cost=p.purchase_cost,
                inventory_value=val,
                days_since_last_sale=days_inactive,
                status=status_str
            ))

    cohort_list = [
        StockAgeingCohort(
            cohort_name=k,
            product_count=v["count"],
            total_units=round(v["units"], 2),
            total_tied_up_capital=round(v["value"], 2)
        )
        for k, v in cohorts_dict.items()
    ]

    # Sort slow products by tied up capital descending
    slow_dead_products.sort(key=lambda x: x.inventory_value, reverse=True)

    return StockAgeingReportOut(
        cohorts=cohort_list,
        slow_and_dead_products=slow_dead_products,
        total_dead_stock_value=round(total_dead_stock_value, 2)
    )

def get_gstr1_report(
    db: Session,
    business_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> Gstr1ReportOut:
    if not end_date:
        end_date = date.today()
    if not start_date:
        # Default to first day of current month
        start_date = end_date.replace(day=1)

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    # All invoices in this date window
    all_invoices = db.query(Invoice).filter(
        Invoice.business_id == business_id,
        Invoice.created_at >= start_dt,
        Invoice.created_at <= end_dt
    ).order_by(Invoice.id.asc()).all()

    completed_invoices = [inv for inv in all_invoices if inv.status == InvoiceStatusEnum.COMPLETED]
    cancelled_count = sum(1 for inv in all_invoices if inv.status == InvoiceStatusEnum.CANCELLED)

    b2b_list: List[Gstr1B2bItem] = []
    b2cs_dict: Dict[float, Dict[str, Any]] = {}
    hsn_dict: Dict[str, Dict[str, Any]] = {}

    tot_taxable = 0.0
    tot_cgst = 0.0
    tot_sgst = 0.0
    tot_igst = 0.0
    tot_tax = 0.0
    grand_total = 0.0

    first_inv = completed_invoices[0].invoice_number if completed_invoices else None
    last_inv = completed_invoices[-1].invoice_number if completed_invoices else None

    # Load customers for GSTIN lookup
    cust_ids = [inv.customer_id for inv in completed_invoices if inv.customer_id]
    customers_map = {}
    if cust_ids:
        custs = db.query(Customer).filter(Customer.id.in_(cust_ids)).all()
        customers_map = {c.id: c for c in custs}

    for inv in completed_invoices:
        cust = customers_map.get(inv.customer_id) if inv.customer_id else None
        cust_gstin = (cust.gstin.strip() if cust and cust.gstin else None)
        is_b2b = bool(cust_gstin and len(cust_gstin) >= 10)

        inv_taxable = round(inv.subtotal - inv.discount_amount, 2)
        inv_cgst = round(inv.cgst_amount, 2)
        inv_sgst = round(inv.sgst_amount, 2)
        inv_igst = round(inv.igst_amount, 2)
        inv_total = round(inv.total_amount, 2)

        tot_taxable += inv_taxable
        tot_cgst += inv_cgst
        tot_sgst += inv_sgst
        tot_igst += inv_igst
        tot_tax += round(inv.tax_amount, 2)
        grand_total += inv_total

        if is_b2b:
            b2b_list.append(Gstr1B2bItem(
                invoice_number=inv.invoice_number,
                invoice_date=inv.created_at.strftime("%Y-%m-%d"),
                customer_name=inv.customer_name or cust.name,
                customer_gstin=cust_gstin,
                taxable_value=inv_taxable,
                cgst_amount=inv_cgst,
                sgst_amount=inv_sgst,
                igst_amount=inv_igst,
                total_amount=inv_total
            ))

        # Process invoice items for B2CS and HSN
        items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == inv.id).all()
        for it in items:
            rate = round(float(it.tax_rate_percent or 0.0), 1)
            item_taxable = round(it.total_amount - it.tax_amount, 2)
            half_tax = round(it.tax_amount / 2.0, 2)

            # B2CS (if not B2B)
            if not is_b2b:
                if rate not in b2cs_dict:
                    b2cs_dict[rate] = {
                        "tax_rate": rate,
                        "taxable_value": 0.0,
                        "cgst_amount": 0.0,
                        "sgst_amount": 0.0,
                        "total_amount": 0.0,
                        "invoices": set()
                    }
                b2cs_dict[rate]["taxable_value"] += item_taxable
                b2cs_dict[rate]["cgst_amount"] += half_tax
                b2cs_dict[rate]["sgst_amount"] += half_tax
                b2cs_dict[rate]["total_amount"] += round(it.total_amount, 2)
                b2cs_dict[rate]["invoices"].add(inv.id)

            # HSN / Item summary
            item_key = it.product_name.strip()
            if item_key not in hsn_dict:
                hsn_dict[item_key] = {
                    "product_name": it.product_name,
                    "unit": it.unit or "piece",
                    "total_quantity": 0.0,
                    "tax_rate": rate,
                    "taxable_value": 0.0,
                    "cgst_amount": 0.0,
                    "sgst_amount": 0.0,
                    "total_amount": 0.0
                }
            hsn_dict[item_key]["total_quantity"] += it.quantity
            hsn_dict[item_key]["taxable_value"] += item_taxable
            hsn_dict[item_key]["cgst_amount"] += half_tax
            hsn_dict[item_key]["sgst_amount"] += half_tax
            hsn_dict[item_key]["total_amount"] += round(it.total_amount, 2)

    b2cs_list = [
        Gstr1B2csItem(
            tax_rate=v["tax_rate"],
            taxable_value=round(v["taxable_value"], 2),
            cgst_amount=round(v["cgst_amount"], 2),
            sgst_amount=round(v["sgst_amount"], 2),
            total_amount=round(v["total_amount"], 2),
            invoice_count=len(v["invoices"])
        )
        for _, v in sorted(b2cs_dict.items(), key=lambda x: x[0])
    ]

    hsn_list = [
        Gstr1HsnItem(
            product_name=v["product_name"],
            unit=v["unit"],
            total_quantity=round(v["total_quantity"], 2),
            tax_rate=v["tax_rate"],
            taxable_value=round(v["taxable_value"], 2),
            cgst_amount=round(v["cgst_amount"], 2),
            sgst_amount=round(v["sgst_amount"], 2),
            total_amount=round(v["total_amount"], 2)
        )
        for _, v in sorted(hsn_dict.items(), key=lambda x: x[1]["total_amount"], reverse=True)
    ]

    summary = Gstr1Summary(
        start_date=start_date.strftime("%Y-%m-%d"),
        end_date=end_date.strftime("%Y-%m-%d"),
        total_invoices=len(all_invoices),
        cancelled_invoices=cancelled_count,
        net_invoices=len(completed_invoices),
        first_invoice_number=first_inv,
        last_invoice_number=last_inv,
        total_taxable_value=round(tot_taxable, 2),
        total_cgst=round(tot_cgst, 2),
        total_sgst=round(tot_sgst, 2),
        total_igst=round(tot_igst, 2),
        total_tax=round(tot_tax, 2),
        grand_total=round(grand_total, 2)
    )

    return Gstr1ReportOut(
        summary=summary,
        b2b=b2b_list,
        b2cs=b2cs_list,
        hsn_summary=hsn_list
    )

def export_gstr1_csv_string(report: Gstr1ReportOut, shop_name: str, gstin: Optional[str] = None) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Header Information
    writer.writerow(["GSTR-1 SALES RETURN STATEMENT"])
    writer.writerow(["Legal Entity / Shop Name", shop_name])
    writer.writerow(["GSTIN", gstin or "URP (Unregistered Dealer)"])
    writer.writerow(["Period", f"{report.summary.start_date} to {report.summary.end_date}"])
    writer.writerow([])

    # 2. Executive Summary
    writer.writerow(["=== 1. EXECUTIVE SUMMARY ==="])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Total Invoices Issued", report.summary.total_invoices])
    writer.writerow(["Cancelled Invoices", report.summary.cancelled_invoices])
    writer.writerow(["Net Valid Invoices", report.summary.net_invoices])
    writer.writerow(["Invoice Range", f"{report.summary.first_invoice_number or 'N/A'} - {report.summary.last_invoice_number or 'N/A'}"])
    writer.writerow(["Total Taxable Value (INR)", f"{report.summary.total_taxable_value:.2f}"])
    writer.writerow(["Total Central Tax CGST (INR)", f"{report.summary.total_cgst:.2f}"])
    writer.writerow(["Total State Tax SGST (INR)", f"{report.summary.total_sgst:.2f}"])
    writer.writerow(["Total Integrated Tax IGST (INR)", f"{report.summary.total_igst:.2f}"])
    writer.writerow(["Total Tax Amount (INR)", f"{report.summary.total_tax:.2f}"])
    writer.writerow(["Grand Total Invoiced (INR)", f"{report.summary.grand_total:.2f}"])
    writer.writerow([])

    # 3. B2CS (Retail Consumer Sales by Tax Rate)
    writer.writerow(["=== 2. B2CS - RETAIL CONSUMER SALES (BY RATE) ==="])
    writer.writerow(["GST Rate (%)", "Taxable Value (INR)", "CGST (INR)", "SGST (INR)", "Total Invoiced (INR)", "Invoice Count"])
    if report.b2cs:
        for r in report.b2cs:
            writer.writerow([
                f"{r.tax_rate}%",
                f"{r.taxable_value:.2f}",
                f"{r.cgst_amount:.2f}",
                f"{r.sgst_amount:.2f}",
                f"{r.total_amount:.2f}",
                r.invoice_count
            ])
    else:
        writer.writerow(["No B2CS sales recorded in this period", "-", "-", "-", "-", "-"])
    writer.writerow([])

    # 4. B2B (Registered Invoices)
    writer.writerow(["=== 3. B2B - REGISTERED BUSINESS INVOICES ==="])
    writer.writerow(["Invoice Number", "Invoice Date", "Customer Name", "Customer GSTIN", "Taxable Value (INR)", "CGST (INR)", "SGST (INR)", "IGST (INR)", "Total Amount (INR)"])
    if report.b2b:
        for b in report.b2b:
            writer.writerow([
                b.invoice_number,
                b.invoice_date,
                b.customer_name,
                b.customer_gstin,
                f"{b.taxable_value:.2f}",
                f"{b.cgst_amount:.2f}",
                f"{b.sgst_amount:.2f}",
                f"{b.igst_amount:.2f}",
                f"{b.total_amount:.2f}"
            ])
    else:
        writer.writerow(["No B2B registered dealer sales recorded in this period", "-", "-", "-", "-", "-", "-", "-", "-"])
    writer.writerow([])

    # 5. HSN / Product-Level Breakdown
    writer.writerow(["=== 4. HSN / PRODUCT-WISE SUMMARY ==="])
    writer.writerow(["Product Name", "Unit", "Qty Sold", "Tax Rate (%)", "Taxable Value (INR)", "CGST (INR)", "SGST (INR)", "Total Amount (INR)"])
    for h in report.hsn_summary:
        writer.writerow([
            h.product_name,
            h.unit,
            f"{h.total_quantity:.2f}",
            f"{h.tax_rate}%",
            f"{h.taxable_value:.2f}",
            f"{h.cgst_amount:.2f}",
            f"{h.sgst_amount:.2f}",
            f"{h.total_amount:.2f}"
        ])
    writer.writerow([])
    writer.writerow(["Generated via SmartStock Retail Platform", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])

    return output.getvalue()
