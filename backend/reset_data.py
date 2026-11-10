from app.database import SessionLocal
from app.models.invoice import Invoice, InvoiceItem, SalesReturn, SalesReturnItem
from app.models.inventory import StockMovement
from app.models.product import Product, ProductBatch, Category
from app.models.customer import Customer
from app.models.purchase import Supplier, PurchaseOrder, PurchaseOrderItem, PurchaseReceipt
from app.models.expense import Expense
from app.models.anomaly import AnomalyAlert
from app.models.audit import AuditLog
from app.models.cash_shift import CashShift
from app.models.reconciliation import StockReconciliationSession, StockReconciliationItem
from app.models.business import Business

def reset():
    db = SessionLocal()
    try:
        biz = db.query(Business).first()
        if not biz:
            print("No business found!")
            return
        biz_id = biz.id

        # Delete all store transactions and catalog items for this business
        # 1. Invoices & Returns
        inv_ids = [i[0] for i in db.query(Invoice.id).filter(Invoice.business_id == biz_id).all()]
        if inv_ids:
            db.query(InvoiceItem).filter(InvoiceItem.invoice_id.in_(inv_ids)).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.business_id == biz_id).delete(synchronize_session=False)

        ret_ids = [r[0] for r in db.query(SalesReturn.id).filter(SalesReturn.business_id == biz_id).all()]
        if ret_ids:
            db.query(SalesReturnItem).filter(SalesReturnItem.sales_return_id.in_(ret_ids)).delete(synchronize_session=False)
        db.query(SalesReturn).filter(SalesReturn.business_id == biz_id).delete(synchronize_session=False)

        # 2. Stock Movements & Batches
        db.query(StockMovement).filter(StockMovement.business_id == biz_id).delete(synchronize_session=False)

        prod_ids = [p[0] for p in db.query(Product.id).filter(Product.business_id == biz_id).all()]
        if prod_ids:
            db.query(ProductBatch).filter(ProductBatch.product_id.in_(prod_ids)).delete(synchronize_session=False)

        # 3. Purchases
        po_ids = [p[0] for p in db.query(PurchaseOrder.id).filter(PurchaseOrder.business_id == biz_id).all()]
        if po_ids:
            db.query(PurchaseOrderItem).filter(PurchaseOrderItem.purchase_order_id.in_(po_ids)).delete(synchronize_session=False)
            db.query(PurchaseReceipt).filter(PurchaseReceipt.purchase_order_id.in_(po_ids)).delete(synchronize_session=False)
        db.query(PurchaseOrder).filter(PurchaseOrder.business_id == biz_id).delete(synchronize_session=False)

        # 4. Reconciliation
        rec_ids = [r[0] for r in db.query(StockReconciliationSession.id).filter(StockReconciliationSession.business_id == biz_id).all()]
        if rec_ids:
            db.query(StockReconciliationItem).filter(StockReconciliationItem.session_id.in_(rec_ids)).delete(synchronize_session=False)
        db.query(StockReconciliationSession).filter(StockReconciliationSession.business_id == biz_id).delete(synchronize_session=False)

        # 5. Products, Categories, Suppliers, Customers
        db.query(Product).filter(Product.business_id == biz_id).delete(synchronize_session=False)
        db.query(Category).filter(Category.business_id == biz_id).delete(synchronize_session=False)
        db.query(Customer).filter(Customer.business_id == biz_id).delete(synchronize_session=False)
        db.query(Supplier).filter(Supplier.business_id == biz_id).delete(synchronize_session=False)

        # 6. Expenses, Anomalies, Cash Shifts, Audit Logs
        db.query(Expense).filter(Expense.business_id == biz_id).delete(synchronize_session=False)
        db.query(AnomalyAlert).filter(AnomalyAlert.business_id == biz_id).delete(synchronize_session=False)
        db.query(CashShift).filter(CashShift.business_id == biz_id).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.business_id == biz_id).delete(synchronize_session=False)

        db.commit()
        print("Successfully reset all store data! Business:", biz.name, "(id:", biz.id, ") is now 100% clean.")
    finally:
        db.close()

if __name__ == "__main__":
    reset()
