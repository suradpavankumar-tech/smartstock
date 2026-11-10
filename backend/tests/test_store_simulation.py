import pytest
from starlette.testclient import TestClient
from datetime import date

def test_full_kirana_store_simulation(client: TestClient):
    print("\n" + "="*70)
    print("=== SMARTSTOCK END-TO-END KIRANA DAY-IN-THE-LIFE SIMULATION ===")
    print("="*70)

    # 1. SETUP: Register Store & Owner
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "simulation_owner@haverikirana.in",
        "password": "HaveriOwnerPass123!",
        "full_name": "Shantappa Patil",
        "business_name": "Haveri Kirana & General Stores",
        "city": "Haveri",
        "phone": "9845999888",
        "gstin": "29AABCU9603R1ZM"
    })
    assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("[OK] STEP 1: Store Owner registered & logged in (Shantappa Patil - Haveri Kirana)")

    # 1.1 Set Shop UPI VPA in profile
    prof_resp = client.put("/api/v1/businesses/profile", headers=headers, json={
        "upi_vpa": "9845999888@ybl",
        "tax_mode": "REGULAR_GST"
    })
    assert prof_resp.status_code == 200
    assert prof_resp.json()["upi_vpa"] == "9845999888@ybl"
    print("[OK] STEP 1.1: Store Profile updated with UPI QR (9845999888@ybl)")

    # 2. MORNING COUNTER OPENING: Open Cash Drawer Shift with float of Rs 1,500.00
    open_shift_resp = client.post("/api/v1/cash-drawer/open", headers=headers, json={
        "opening_float": 1500.0
    })
    assert open_shift_resp.status_code == 201, f"Failed to open shift: {open_shift_resp.text}"
    shift_data = open_shift_resp.json()
    assert shift_data["status"] == "OPEN"
    assert shift_data["opening_float"] == 1500.0
    print(f"[OK] STEP 2: Morning Counter Shift opened with Float Rs {shift_data['opening_float']:.2f}")

    # 3. CATALOGUE: Seed Real Kirana FMCG Products with barcodes
    p1 = client.post("/api/v1/products/", headers=headers, json={
        "name": "Nandini Pure Cow Ghee 500ml",
        "barcode": "8906036670014",
        "purchase_cost": 290.0,
        "selling_price": 340.0,
        "initial_stock": 25.0,
        "min_stock_level": 5.0
    }).json()

    p2 = client.post("/api/v1/products/", headers=headers, json={
        "name": "Fortune Sunlite Sunflower Oil 1L",
        "barcode": "8906007280013",
        "purchase_cost": 115.0,
        "selling_price": 135.0,
        "initial_stock": 40.0,
        "min_stock_level": 10.0
    }).json()

    p3 = client.post("/api/v1/products/", headers=headers, json={
        "name": "Madhur Pure & Hygienic Sugar 1kg",
        "barcode": "8906014640053",
        "purchase_cost": 42.0,
        "selling_price": 48.0,
        "initial_stock": 50.0,
        "min_stock_level": 15.0
    }).json()

    p4 = client.post("/api/v1/products/", headers=headers, json={
        "name": "Aashirvaad Shudh Chakki Atta 5kg",
        "barcode": "8901030010180",
        "purchase_cost": 235.0,
        "selling_price": 275.0,
        "initial_stock": 30.0,
        "min_stock_level": 8.0
    }).json()
    print("[OK] STEP 3: 4 Branded Kirana items created with verified barcodes & stock")

    # 4. SALE 1: Cash Customer Bill
    # 2x Ghee (Rs 680) + 1x Sugar (Rs 48) = Rs 728.00 Cash
    inv1_resp = client.post("/api/v1/invoices/", headers=headers, json={
        "payment_method": "CASH",
        "items": [
            {"product_id": p1["id"], "quantity": 2.0, "unit_price": 340.0},
            {"product_id": p3["id"], "quantity": 1.0, "unit_price": 48.0}
        ]
    })
    assert inv1_resp.status_code == 200, f"Sale 1 failed: {inv1_resp.text}"
    inv1 = inv1_resp.json()
    assert inv1["total_amount"] == 728.0
    assert inv1["payment_method"] == "CASH"
    print(f"[OK] STEP 4: Sale 1 (Cash) completed: Bill #{inv1['invoice_number']} for Rs {inv1['total_amount']:.2f}")

    # 5. SALE 2: Dynamic UPI QR Customer Bill
    # 1x Fortune Oil (Rs 135) + 1x Aashirvaad Atta (Rs 275) = Rs 410.00 UPI
    inv2_resp = client.post("/api/v1/invoices/", headers=headers, json={
        "payment_method": "UPI",
        "payment_reference": "UPI-RR-9845012345-001",
        "items": [
            {"product_id": p2["id"], "quantity": 1.0, "unit_price": 135.0},
            {"product_id": p4["id"], "quantity": 1.0, "unit_price": 275.0}
        ]
    })
    assert inv2_resp.status_code == 200, f"Sale 2 failed: {inv2_resp.text}"
    inv2 = inv2_resp.json()
    assert inv2["total_amount"] == 410.0
    assert inv2["payment_method"] == "UPI"
    print(f"[OK] STEP 5: Sale 2 (UPI QR) completed: Bill #{inv2['invoice_number']} for Rs {inv2['total_amount']:.2f}")

    # 6. KHATA: Regular Customer purchases on Udhar (Credit) & later repays
    cust_resp = client.post("/api/v1/customers/", headers=headers, json={
        "name": "Basavaraj Hiremath",
        "phone": "9448123456",
        "address": "Vidyanagar, Haveri",
        "credit_limit": 5000.0
    })
    assert cust_resp.status_code == 200
    cust = cust_resp.json()

    # Credit bill: 1x Atta (Rs 275) + 2x Sugar (Rs 96) = Rs 371.00 CREDIT
    inv3_resp = client.post("/api/v1/invoices/", headers=headers, json={
        "customer_id": cust["id"],
        "payment_method": "CREDIT",
        "items": [
            {"product_id": p4["id"], "quantity": 1.0, "unit_price": 275.0},
            {"product_id": p3["id"], "quantity": 2.0, "unit_price": 48.0}
        ]
    })
    assert inv3_resp.status_code == 200
    assert inv3_resp.json()["total_amount"] == 371.0

    # Verify customer Khata balance updated to Rs 371
    cust_check = client.get(f"/api/v1/customers/?search=9448123456", headers=headers).json()
    assert cust_check[0]["outstanding_balance"] == 371.0
    print(f"[OK] STEP 6.1: Khata Credit purchase: Basavaraj outstanding Udhar is Rs {cust_check[0]['outstanding_balance']:.2f}")

    # Basavaraj walks in at 3 PM and pays Rs 200 cash repayment on his Khata
    repay_resp = client.post(f"/api/v1/customers/{cust['id']}/payment", headers=headers, json={
        "amount": 200.0,
        "payment_method": "CASH",
        "note": "Partial Udhar cash repayment"
    })
    assert repay_resp.status_code == 200
    assert repay_resp.json()["outstanding_balance"] == 171.0
    print(f"[OK] STEP 6.2: Khata Repayment: Basavaraj paid Rs 200.00 cash; remaining balance is Rs 171.00")

    # 7. EXPENSES: Daily Kirana petty cash expenses recorded
    exp1 = client.post("/api/v1/expenses/", headers=headers, json={
        "title": "Staff Morning Tea & Snacks",
        "category": "OTHER",
        "amount": 60.0,
        "payment_method": "CASH",
        "expense_date": str(date.today())
    }).json()

    exp2 = client.post("/api/v1/expenses/", headers=headers, json={
        "title": "Auto Freight charges for APMC goods",
        "category": "TRANSPORT",
        "amount": 200.0,
        "payment_method": "CASH",
        "expense_date": str(date.today())
    }).json()
    print("[OK] STEP 7: Recorded 2 Cash Expenses (Tea Rs 60, Auto Rs 200 = Total Rs 260)")

    # 8. PROCUREMENT & SUPPLIER PO
    sup_resp = client.post("/api/v1/suppliers/", headers=headers, json={
        "name": "Haveri Agro & FMCG Wholesale",
        "contact_person": "Suresh Patil",
        "phone": "9845511223",
        "lead_time_days": 2,
        "payment_terms_days": 15
    })
    assert sup_resp.status_code == 200
    supplier = sup_resp.json()

    # Raise PO for 20 bags of Aashirvaad Atta
    po_resp = client.post("/api/v1/purchases/orders", headers=headers, json={
        "supplier_id": supplier["id"],
        "items": [
            {"product_id": p4["id"], "quantity_ordered": 20.0, "unit_cost": 235.0}
        ]
    })
    assert po_resp.status_code == 200
    po = po_resp.json()
    po_id = po["id"]
    print(f"[OK] STEP 8.1: Raised PO #{po['po_number']} to {supplier['name']} for 20 bags Atta (Rs 4,700)")

    # Receive stock from distributor
    recv_resp = client.post(f"/api/v1/purchases/orders/{po_id}/receive", headers=headers, json={
        "items": [
            {
                "po_item_id": po["items"][0]["id"],
                "quantity_received_now": 20.0,
                "batch_number": "BATCH-2026-NOV-A",
                "expiry_date": "2027-05-30"
            }
        ],
        "notes": "Delivery verified in full by store manager"
    })
    assert recv_resp.status_code == 200, f"Receive PO failed: {recv_resp.text}"
    assert recv_resp.json()["status"] == "COMPLETED"
    print("[OK] STEP 8.2: Goods received & inventoried with batch BATCH-2026-NOV-A")

    # 9. EVENING SHIFT CLOSING & CASH DRAWER RECONCILIATION
    # Expected Cash Formula:
    # Opening Float (1500) + Cash Sales (728) - Cash Expenses (260) = 1,968.00
    curr_shift = client.get("/api/v1/cash-drawer/current", headers=headers).json()
    assert curr_shift["expected_cash"] == 1968.0, f"Expected 1968.0, got {curr_shift['expected_cash']}"

    # Cashier physical count is exactly 1968.00
    close_resp = client.post("/api/v1/cash-drawer/close", headers=headers, json={
        "counted_cash": 1968.0
    })
    assert close_resp.status_code == 200
    closed_shift = close_resp.json()
    assert closed_shift["status"] == "CLOSED"
    assert closed_shift["variance"] == 0.0
    print(f"[OK] STEP 9: Evening Cash Drawer reconciled & closed: Counted Rs {closed_shift['counted_cash']:.2f}, Variance Rs 0.00 (Perfect Match!)")

    # 10. FORENSIC AUDIT LOG VERIFICATION
    sum_resp = client.get("/api/v1/audit/summary", headers=headers)
    assert sum_resp.status_code == 200
    audit_summary = sum_resp.json()
    assert audit_summary["today_events"] >= 8
    print(f"[OK] STEP 10.1: Audit Summary verified: {audit_summary['today_events']} operations logged today")

    csv_resp = client.get("/api/v1/audit/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "Shantappa Patil" in csv_resp.text
    print("[OK] STEP 10.2: 1-Click Audit Trail CSV exported successfully")

    print("="*70)
    print("ALL 10 STEPS OF THE END-TO-END KIRANA DAY SIMULATION PASSED!")
    print("="*70 + "\n")
