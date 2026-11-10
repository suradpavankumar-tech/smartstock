from pydantic import BaseModel
from typing import Optional, List
from datetime import date

class FinancialSummaryOut(BaseModel):
    start_date: date
    end_date: date
    gross_sales: float
    discounts: float
    returns: float
    net_sales: float
    cost_of_goods_sold: float
    gross_profit: float
    gross_margin_percent: float
    operating_expenses: float
    operating_profit: float
    total_invoices_count: int
    average_order_value: float
    inventory_valuation: float  # current inventory worth (units * WAC)
    total_stock_units: float
    low_stock_products_count: int

class DailySalesPoint(BaseModel):
    date: str
    sales: float
    cost: float
    profit: float
    invoices: int

class ProductPerformancePoint(BaseModel):
    product_id: int
    product_name: str
    category_name: Optional[str] = None
    units_sold: float
    revenue: float
    cost: float
    gross_profit: float
    margin_percent: float

class CategoryPerformancePoint(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    units_sold: float
    revenue: float
    revenue_percentage: float

class StockAgeingCohort(BaseModel):
    cohort_name: str  # 0-30 days, 31-60 days, 61-90 days, 90+ days
    product_count: int
    total_units: float
    total_tied_up_capital: float

class StockAgeingProduct(BaseModel):
    product_id: int
    product_name: str
    current_stock: float
    unit_cost: float
    inventory_value: float
    days_since_last_sale: int
    status: str  # ACTIVE, SLOW, DORMANT, DEAD

class StockAgeingReportOut(BaseModel):
    cohorts: List[StockAgeingCohort]
    slow_and_dead_products: List[StockAgeingProduct]
    total_dead_stock_value: float

class Gstr1B2bItem(BaseModel):
    invoice_number: str
    invoice_date: str
    customer_name: str
    customer_gstin: str
    taxable_value: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_amount: float

class Gstr1B2csItem(BaseModel):
    tax_rate: float
    taxable_value: float
    cgst_amount: float
    sgst_amount: float
    total_amount: float
    invoice_count: int

class Gstr1HsnItem(BaseModel):
    product_name: str
    sku: Optional[str] = None
    unit: str
    total_quantity: float
    tax_rate: float
    taxable_value: float
    cgst_amount: float
    sgst_amount: float
    total_amount: float

class Gstr1Summary(BaseModel):
    start_date: str
    end_date: str
    total_invoices: int
    cancelled_invoices: int
    net_invoices: int
    first_invoice_number: Optional[str] = None
    last_invoice_number: Optional[str] = None
    total_taxable_value: float
    total_cgst: float
    total_sgst: float
    total_igst: float
    total_tax: float
    grand_total: float

class Gstr1ReportOut(BaseModel):
    summary: Gstr1Summary
    b2b: List[Gstr1B2bItem]
    b2cs: List[Gstr1B2csItem]
    hsn_summary: List[Gstr1HsnItem]
