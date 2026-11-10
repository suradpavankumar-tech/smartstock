import random
from datetime import datetime, timedelta
from app.database import SessionLocal
from app.models.business import Business
from app.models.user import User
from app.models.product import Category, Product, ProductBatch
from app.models.customer import Customer
from app.models.inventory import StockMovement, MovementTypeEnum
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatusEnum, PaymentMethodEnum
from app.models.purchase import Supplier
from app.models.expense import Expense, ExpenseCategoryEnum
from app.models.anomaly import AnomalyAlert, AnomalySeverityEnum, AnomalyStatusEnum

def seed():
    db = SessionLocal()
    try:
        biz = db.query(Business).first()
        if not biz:
            print("No business found!")
            return
        
        user = db.query(User).first()
        if not user:
            print("No user found!")
            return

        biz_id = biz.id
        user_id = user.id

        # 1. Clean existing data for this business
        # Delete invoice items by invoice id
        existing_invoices = db.query(Invoice.id).filter(Invoice.business_id == biz_id).all()
        inv_ids = [i[0] for i in existing_invoices]
        if inv_ids:
            db.query(InvoiceItem).filter(InvoiceItem.invoice_id.in_(inv_ids)).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.business_id == biz_id).delete(synchronize_session=False)
        db.query(StockMovement).filter(StockMovement.business_id == biz_id).delete(synchronize_session=False)
        
        existing_prods = db.query(Product.id).filter(Product.business_id == biz_id).all()
        prod_ids = [p[0] for p in existing_prods]
        if prod_ids:
            db.query(ProductBatch).filter(ProductBatch.product_id.in_(prod_ids)).delete(synchronize_session=False)
            
        db.query(Product).filter(Product.business_id == biz_id).delete(synchronize_session=False)
        db.query(Category).filter(Category.business_id == biz_id).delete(synchronize_session=False)
        db.query(Customer).filter(Customer.business_id == biz_id).delete(synchronize_session=False)
        db.query(Supplier).filter(Supplier.business_id == biz_id).delete(synchronize_session=False)
        db.query(Expense).filter(Expense.business_id == biz_id).delete(synchronize_session=False)
        db.query(AnomalyAlert).filter(AnomalyAlert.business_id == biz_id).delete(synchronize_session=False)
        db.commit()

        print("Cleaned existing data for business", biz_id)

        # 2. Categories
        cat_grains = Category(business_id=biz_id, name="Grains & Staples", section_name="Staples", description="Rice, Atta, Dal & Flours")
        cat_dairy = Category(business_id=biz_id, name="Dairy & Beverages", section_name="Beverages", description="Milk, Tea, Coffee")
        cat_spices = Category(business_id=biz_id, name="Spices & Oils", section_name="Groceries", description="Cooking oil, Masalas")
        cat_snacks = Category(business_id=biz_id, name="Snacks & Instant Foods", section_name="FMCG", description="Biscuits, Noodles, Snacks")
        cat_care = Category(business_id=biz_id, name="Personal & Home Care", section_name="Household", description="Soaps, Detergents")
        db.add_all([cat_grains, cat_dairy, cat_spices, cat_snacks, cat_care])
        db.flush()

        # 3. Suppliers
        sup_hubballi = Supplier(
            business_id=biz_id,
            name="Hubballi Wholesale Depot",
            contact_person="Manjunath Patil",
            phone="9845012345",
            email="hubballi.depot@gmail.com",
            address="APMC Yard, Hubballi",
            lead_time_days=2,
            payment_terms_days=15
        )
        sup_haveri = Supplier(
            business_id=biz_id,
            name="Haveri FMCG Distributors",
            contact_person="Santosh K",
            phone="9886012345",
            email="haveri.fmcg@gmail.com",
            address="Station Road, Haveri",
            lead_time_days=1,
            payment_terms_days=7
        )
        db.add_all([sup_hubballi, sup_haveri])
        db.flush()

        # 4. Customers
        c1 = Customer(business_id=biz_id, name="Ramesh Gouda", phone="9845112233", address="Vidyanagar, Haveri", outstanding_balance=1450.0)
        c2 = Customer(business_id=biz_id, name="Ningappa Pujar", phone="9900223344", address="Shivalinga Nagar, Haveri", outstanding_balance=620.0)
        c3 = Customer(business_id=biz_id, name="Shreedhar Kulkarni", phone="9448334455", address="Basaveshwara Nagar, Haveri", outstanding_balance=0.0)
        db.add_all([c1, c2, c3])
        db.flush()

        # 5. Products
        prods_data = [
            ("Aashirvaad Shudh Chakki Atta 5kg", "ATTA-5KG", "890103001", cat_grains.id, "packet", 210.0, 255.0, 5.0, 25.0, 10.0, 24.0, sup_hubballi.id),
            ("Nandini Toned Milk 500ml", "MILK-500ML", "890103002", cat_dairy.id, "packet", 22.0, 24.0, 0.0, 42.0, 15.0, 50.0, sup_haveri.id),
            ("Tata Salt Vacuum Evaporated 1kg", "SALT-1KG", "890103003", cat_grains.id, "packet", 22.0, 28.0, 0.0, 65.0, 20.0, 50.0, sup_haveri.id),
            ("Toor Dal Desi Grade-A 1kg", "DAL-1KG", "890103004", cat_grains.id, "kg", 140.0, 175.0, 0.0, 5.0, 15.0, 25.0, sup_hubballi.id), # Low stock trigger
            ("Gemini Pure Sunflower Oil 1L", "OIL-1L", "890103005", cat_spices.id, "packet", 125.0, 148.0, 5.0, 32.0, 12.0, 30.0, sup_haveri.id),
            ("Byadgi Red Chilli Whole 500g", "CHILLI-500G", "890103006", cat_spices.id, "packet", 190.0, 240.0, 0.0, 18.0, 8.0, 20.0, sup_haveri.id),
            ("Everest Garam Masala 100g", "MASALA-100G", "890103007", cat_spices.id, "box", 68.0, 85.0, 5.0, 3.0, 10.0, 20.0, sup_haveri.id), # Low stock trigger
            ("Parle-G Gold Biscuits 1kg Pack", "PARLE-1KG", "890103008", cat_snacks.id, "packet", 110.0, 130.0, 18.0, 35.0, 10.0, 20.0, sup_haveri.id),
            ("Maggi 2-Minute Masala Noodles 70g", "MAGGI-70G", "890103009", cat_snacks.id, "packet", 11.5, 14.0, 12.0, 95.0, 30.0, 96.0, sup_haveri.id),
            ("Wagh Bakri Premium CTC Tea 500g", "TEA-500G", "890103010", cat_dairy.id, "box", 240.0, 285.0, 5.0, 18.0, 8.0, 16.0, sup_hubballi.id),
            ("Dettol Original Bathing Soap 125g", "DETTOL-125G", "890103011", cat_care.id, "piece", 42.0, 52.0, 18.0, 28.0, 12.0, 48.0, sup_haveri.id),
            ("Surf Excel Easy Wash Detergent 1kg", "SURF-1KG", "890103012", cat_care.id, "packet", 128.0, 155.0, 18.0, 22.0, 10.0, 24.0, sup_haveri.id),
        ]

        created_products = []
        for name, sku, bc, cat_id, unit, cost, price, tax, stock, reorder, moq, sup_id in prods_data:
            p = Product(
                business_id=biz_id,
                name=name,
                sku=sku,
                barcode=bc,
                category_id=cat_id,
                supplier_id=sup_id,
                unit=unit,
                purchase_cost=cost,
                selling_price=price,
                tax_rate_percent=tax,
                current_stock=stock,
                reorder_threshold=reorder,
                min_order_qty=moq,
                is_archived=False
            )
            db.add(p)
            db.flush()
            created_products.append(p)

            # Record initial stock movement
            sm = StockMovement(
                business_id=biz_id,
                product_id=p.id,
                movement_type=MovementTypeEnum.OPENING_STOCK,
                quantity=stock,
                balance_after=stock,
                unit_cost=cost,
                total_cost=round(stock * cost, 2),
                reference_type="opening_balance",
                notes="Store initial inventory opening balance",
                created_by_user_id=user_id,
                created_at=datetime.utcnow() - timedelta(days=20)
            )
            db.add(sm)

        db.commit()
        print(f"Created {len(created_products)} products with opening stock!")

        # 6. Generate 16 days of historical sales (to satisfy 14-day ML gate!)
        now = datetime.utcnow()
        inv_count = 1
        payment_methods = [PaymentMethodEnum.UPI, PaymentMethodEnum.CASH, PaymentMethodEnum.UPI, PaymentMethodEnum.CREDIT]

        for day_offset in range(16, 0, -1):
            sale_date = now - timedelta(days=day_offset, hours=random.randint(2, 8), minutes=random.randint(10, 50))
            invoices_today = random.randint(2, 4)

            for _ in range(invoices_today):
                inv_no = f"INV-{sale_date.year}-{inv_count:05d}"
                inv_count += 1
                pm = random.choice(payment_methods)
                cust = c1 if pm == PaymentMethodEnum.CREDIT else (c2 if random.random() > 0.6 else None)

                # Pick 2 to 4 items for this invoice
                picked_prods = random.sample(created_products, random.randint(2, 4))
                subtotal = 0.0
                total_tax = 0.0
                total_cost = 0.0
                items = []

                for p in picked_prods:
                    qty = random.choice([1.0, 1.0, 2.0, 3.0])
                    tax_rate = p.tax_rate_percent or 0.0
                    item_total = round(qty * p.selling_price, 2)
                    base_price = round(item_total / (1.0 + (tax_rate / 100.0)), 2)
                    tax_val = round(item_total - base_price, 2)
                    cost_val = round(qty * p.purchase_cost, 2)

                    subtotal += base_price
                    total_tax += tax_val
                    total_cost += cost_val

                    it = InvoiceItem(
                        product_id=p.id,
                        product_name=p.name,
                        unit=p.unit,
                        quantity=qty,
                        unit_price=p.selling_price,
                        unit_cost=p.purchase_cost,
                        discount_amount=0.0,
                        tax_rate_percent=tax_rate,
                        tax_amount=tax_val,
                        total_amount=item_total,
                        total_cost=cost_val
                    )
                    items.append(it)

                total_amount = round(subtotal + total_tax, 2)
                half_tax = round(total_tax / 2.0, 2)

                inv = Invoice(
                    business_id=biz_id,
                    invoice_number=inv_no,
                    customer_id=cust.id if cust else None,
                    created_by_user_id=user_id,
                    customer_name=cust.name if cust else "Walk-in Customer",
                    customer_phone=cust.phone if cust else "",
                    subtotal=round(subtotal, 2),
                    discount_amount=0.0,
                    tax_amount=round(total_tax, 2),
                    cgst_amount=half_tax,
                    sgst_amount=half_tax,
                    igst_amount=0.0,
                    total_amount=total_amount,
                    total_cost=round(total_cost, 2),
                    payment_method=pm,
                    payment_status="PAID" if pm != PaymentMethodEnum.CREDIT else "PENDING",
                    status=InvoiceStatusEnum.COMPLETED,
                    created_at=sale_date
                )
                db.add(inv)
                db.flush()

                for it in items:
                    it.invoice_id = inv.id
                    db.add(it)
                    # Record stock movement
                    sm = StockMovement(
                        business_id=biz_id,
                        product_id=it.product_id,
                        movement_type=MovementTypeEnum.SALE,
                        quantity=-it.quantity,
                        balance_after=0.0,
                        unit_cost=it.unit_cost,
                        total_cost=it.total_cost,
                        reference_type="invoice",
                        reference_id=str(inv.id),
                        notes=f"POS Sale #{inv_no}",
                        created_by_user_id=user_id,
                        created_at=sale_date
                    )
                    db.add(sm)

        db.commit()
        print(f"Created {inv_count - 1} historical sales invoices across 16 days!")

        # 7. Expenses
        exp1 = Expense(
            business_id=biz_id,
            category=ExpenseCategoryEnum.RENT,
            title="Shop Monthly Rent (Station Road)",
            amount=8500.0,
            payment_method="UPI",
            expense_date=(now - timedelta(days=5)).date(),
            notes="Paid to Mallikarjun Landlord via PhonePe",
            created_by_user_id=user_id
        )
        exp2 = Expense(
            business_id=biz_id,
            category=ExpenseCategoryEnum.ELECTRICITY,
            title="HESCOM Commercial Electricity Bill",
            amount=1450.0,
            payment_method="UPI",
            expense_date=(now - timedelta(days=2)).date(),
            notes="Commercial tariff bill",
            created_by_user_id=user_id
        )
        exp3 = Expense(
            business_id=biz_id,
            category=ExpenseCategoryEnum.PACKAGING,
            title="Carry Bags & Packaging Material",
            amount=650.0,
            payment_method="CASH",
            expense_date=(now - timedelta(days=8)).date(),
            notes="Haveri Packaging Mart",
            created_by_user_id=user_id
        )
        db.add_all([exp1, exp2, exp3])

        # 8. Anomaly Alert
        alert1 = AnomalyAlert(
            business_id=biz_id,
            alert_type="LARGE_STOCK_ADJUSTMENT",
            severity=AnomalySeverityEnum.HIGH,
            description="Rapid depletion detected for Toor Dal Desi (Stock: 5.0 kg, Threshold: 15.0 kg)",
            entity_type="product",
            entity_id=str(created_products[3].id),
            status=AnomalyStatusEnum.PENDING_REVIEW,
            created_at=now
        )
        db.add(alert1)
        db.commit()

        print("Seed completed successfully with 100% realistic Kirana data!")

    finally:
        db.close()

if __name__ == "__main__":
    seed()
