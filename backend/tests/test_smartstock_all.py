import pytest
from fastapi.testclient import TestClient

def test_auth_and_registration(client: TestClient):
    # 1. Register Owner for Shop A
    payload_a = {
        "email": "owner.haveri@smartstock.in",
        "password": "SecurePassword123!",
        "full_name": "Manjunath Patil",
        "phone": "9845012345",
        "business_name": "Haveri Kirana & General Store",
        "gstin": "29ABCDE1234F1Z5",
        "city": "Haveri",
        "district": "Haveri",
        "state": "Karnataka"
    }
    resp = client.post("/api/v1/auth/register", json=payload_a)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "OWNER"
    assert data["business_name"] == "Haveri Kirana & General Store"

    # 2. Login
    login_resp = client.post("/api/v1/auth/login", json={
        "email": "owner.haveri@smartstock.in",
        "password": "SecurePassword123!"
    })
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

    # 3. /me profile
    token = data["access_token"]
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["user"]["email"] == "owner.haveri@smartstock.in"
    assert me_data["current_business"]["name"] == "Haveri Kirana & General Store"

def test_tenant_isolation_boundary(client: TestClient):
    # Register Shop A
    resp_a = client.post("/api/v1/auth/register", json={
        "email": "shop_a@smartstock.in",
        "password": "Password123!",
        "full_name": "Owner A",
        "business_name": "Shop A Haveri",
        "city": "Haveri"
    })
    assert resp_a.status_code == 200, resp_a.text
    token_a = resp_a.json()["access_token"]

    # Register Shop B
    resp_b = client.post("/api/v1/auth/register", json={
        "email": "shop_b@smartstock.in",
        "password": "Password123!",
        "full_name": "Owner B",
        "business_name": "Shop B Byadgi",
        "city": "Byadgi"
    })
    assert resp_b.status_code == 200, resp_b.text
    token_b = resp_b.json()["access_token"]

    # Shop A creates Category and Product
    cat_resp = client.post(
        "/api/v1/categories/",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"name": "Spices", "section_name": "Grocery"}
    )
    assert cat_resp.status_code == 200
    cat_a_id = cat_resp.json()["id"]

    prod_a_resp = client.post(
        "/api/v1/products/",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "name": "Byadgi Chilli Powder 500g",
            "sku": "CHILLI-500G",
            "barcode": "8901234567890",
            "category_id": cat_a_id,
            "unit": "packet",
            "purchase_cost": 120.0,
            "selling_price": 160.0,
            "tax_rate_percent": 5.0,
            "initial_stock": 50.0,
            "reorder_threshold": 10.0,
            "min_order_qty": 20.0
        }
    )
    assert prod_a_resp.status_code == 200
    prod_a_id = prod_a_resp.json()["id"]

    # PROVE: Shop B CANNOT view Shop A's product
    get_resp_b = client.get(
        f"/api/v1/products/{prod_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert get_resp_b.status_code == 404, "Shop B must NOT access Shop A product"

    # PROVE: Shop B's product list does NOT contain Shop A's product
    list_b = client.get("/api/v1/products/", headers={"Authorization": f"Bearer {token_b}"})
    assert list_b.status_code == 200
    b_prods = list_b.json()
    assert all(p["id"] != prod_a_id for p in b_prods), "Cross-tenant leakage detected!"

    # PROVE: Shop B CANNOT update Shop A's product
    upd_resp_b = client.put(
        f"/api/v1/products/{prod_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"name": "Hacked Name"}
    )
    assert upd_resp_b.status_code == 404

def test_billing_pos_and_inventory_deduction(client: TestClient):
    # Setup Shop
    resp = client.post("/api/v1/auth/register", json={
        "email": "pos_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Cashier Suresh",
        "business_name": "Suresh Mart Haveri",
        "city": "Haveri"
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Product with 100 units
    prod_resp = client.post(
        "/api/v1/products/",
        headers=headers,
        json={
            "name": "Basmati Rice 1kg",
            "sku": "RICE-1KG",
            "barcode": "8901112223334",
            "unit": "packet",
            "purchase_cost": 80.0,
            "selling_price": 110.0,
            "tax_rate_percent": 5.0,
            "initial_stock": 100.0,
            "reorder_threshold": 15.0
        }
    )
    prod_id = prod_resp.json()["id"]

    # 1. Billing POS: Sale of 5 units
    idempotency_key = "uuid-test-pos-sale-001"
    inv_payload = {
        "customer_name": "Ramesh Gouda",
        "customer_phone": "9900112233",
        "payment_method": "CASH",
        "discount_amount": 10.0,
        "idempotency_key": idempotency_key,
        "items": [
            {
                "product_id": prod_id,
                "quantity": 5.0,
                "unit_price": 110.0,
                "discount_amount": 0.0
            }
        ]
    }
    inv_resp = client.post("/api/v1/invoices/", headers=headers, json=inv_payload)
    assert inv_resp.status_code == 200, inv_resp.text
    inv_data = inv_resp.json()
    assert inv_data["invoice_number"].startswith("INV-")
    assert inv_data["subtotal"] == 550.0  # 5 * 110
    assert inv_data["discount_amount"] == 10.0
    # taxable: 540.0, 5% tax = 27.5 (or line tax), total = 567.5
    assert inv_data["tax_amount"] == 27.5
    assert inv_data["total_amount"] == 567.5

    # Verify inventory was deducted: 100 - 5 = 95
    p_check = client.get(f"/api/v1/products/{prod_id}", headers=headers).json()
    assert p_check["current_stock"] == 95.0

    # 2. Idempotency test: Retry exact same billing request
    inv_retry = client.post("/api/v1/invoices/", headers=headers, json=inv_payload)
    assert inv_retry.status_code == 200
    assert inv_retry.json()["id"] == inv_data["id"]
    # Check inventory was NOT deducted a second time
    p_check2 = client.get(f"/api/v1/products/{prod_id}", headers=headers).json()
    assert p_check2["current_stock"] == 95.0, "Duplicate stock deduction occurred on retry!"

    # 3. Invoice Cancellation: Cancel invoice and verify inventory restock
    cancel_resp = client.post(
        f"/api/v1/invoices/{inv_data['id']}/cancel",
        headers=headers,
        json={"reason": "Customer entered wrong phone number"}
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "CANCELLED"

    # Stock should be restored to 100
    p_check3 = client.get(f"/api/v1/products/{prod_id}", headers=headers).json()
    assert p_check3["current_stock"] == 100.0, "Stock was not restored upon cancellation"

def test_purchases_and_partial_receiving(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "purchase_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Purchaser Anand",
        "business_name": "Anand Traders",
        "city": "Haveri"
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Supplier
    sup_resp = client.post("/api/v1/suppliers/", headers=headers, json={
        "name": "Karnataka Agro Distributors",
        "contact_person": "Venkatesh",
        "phone": "9880011223",
        "lead_time_days": 4
    })
    sup_id = sup_resp.json()["id"]

    # Create Product with 10 units at ₹50 cost
    prod_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Sunflower Oil 1L",
        "sku": "OIL-1L",
        "supplier_id": sup_id,
        "purchase_cost": 50.0,
        "selling_price": 70.0,
        "initial_stock": 10.0
    })
    prod_id = prod_resp.json()["id"]

    # Create Purchase Order for 50 units at ₹55 cost
    po_resp = client.post("/api/v1/purchases/orders", headers=headers, json={
        "supplier_id": sup_id,
        "items": [
            {
                "product_id": prod_id,
                "quantity_ordered": 50.0,
                "unit_cost": 55.0,
                "tax_rate_percent": 0.0
            }
        ]
    })
    assert po_resp.status_code == 200
    po_data = po_resp.json()
    po_id = po_data["id"]
    po_item_id = po_data["items"][0]["id"]
    assert po_data["status"] == "ORDERED"

    # Partial Receiving: Receive 30 units
    rcp_resp = client.post(
        f"/api/v1/purchases/orders/{po_id}/receive",
        headers=headers,
        json={
            "notes": "Partial first batch delivery",
            "items": [
                {
                    "po_item_id": po_item_id,
                    "quantity_received_now": 30.0,
                    "batch_number": "BATCH-OIL-2026-A"
                }
            ]
        }
    )
    assert rcp_resp.status_code == 200
    po_updated = rcp_resp.json()
    assert po_updated["status"] == "PARTIALLY_RECEIVED"

    # Check inventory increased: 10 + 30 = 40 units
    p_check = client.get(f"/api/v1/products/{prod_id}", headers=headers).json()
    assert p_check["current_stock"] == 40.0
    # Weighted Average Cost: (10 * 50 + 30 * 55) / 40 = (500 + 1650) / 40 = 2150 / 40 = 53.75
    assert p_check["purchase_cost"] == 53.75

def test_forecasting_data_sufficiency(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "ml_test@smartstock.in",
        "password": "Password123!",
        "full_name": "ML Tester",
        "business_name": "New Shop ML Test",
        "city": "Haveri"
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    prod_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Tea Powder 250g",
        "selling_price": 85.0,
        "initial_stock": 20.0
    })
    prod_id = prod_resp.json()["id"]

    # Test Forecast endpoint: Brand new shop with < 14 days of history
    forecast_resp = client.get(f"/api/v1/forecasting/products/{prod_id}", headers=headers)
    assert forecast_resp.status_code == 200
    f_data = forecast_resp.json()
    assert f_data["status"] in ("INSUFFICIENT_DATA", "NO_SALES_RECORDED")
    assert any(phrase in f_data["explanation"] for phrase in ("Insufficient history", "No customer sales"))
    assert f_data["mae"] is None
    assert f_data["wape"] is None

def test_reorder_recommendations(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "reorder_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Reorder Tester",
        "business_name": "Reorder Test Mart",
        "city": "Haveri"
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Product with low stock (2 units, threshold 15)
    prod_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Soap Bar 125g",
        "purchase_cost": 25.0,
        "selling_price": 35.0,
        "initial_stock": 2.0,
        "reorder_threshold": 15.0,
        "min_order_qty": 24.0
    })

    # Recommendations query
    recs_resp = client.get("/api/v1/recommendations/", headers=headers)
    assert recs_resp.status_code == 200
    recs = recs_resp.json()
    assert len(recs) >= 1
    soap_rec = next(r for r in recs if r["product_name"] == "Soap Bar 125g")
    assert soap_rec["urgency_level"] in ("CRITICAL", "HIGH")
    assert soap_rec["recommended_order_qty"] >= 24.0  # Respects MOQ

def test_business_assistant_and_simulator(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "assistant_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Assistant Tester",
        "business_name": "Assistant Mart Haveri",
        "city": "Haveri"
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Ask Profit question
    q_resp = client.post(
        "/api/v1/assistant/query",
        headers=headers,
        json={"query": "How much gross profit did I make this month?"}
    )
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    assert q_data["intent"] == "GROSS_AND_OPERATING_PROFIT"
    assert "drilldown_route" in q_data
    assert "metric_definition" in q_data

    # What-if simulator: Delay 7 days
    sim_resp = client.get("/api/v1/simulator/delay?delay_days=7", headers=headers)
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()
    assert sim_data["scenario_type"] == "SUPPLIER_DELIVERY_DELAY"
    assert "assumptions" in sim_data


def test_reconciliation_workflow(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "recon_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Audit Manager",
        "business_name": "Recon Mart",
        "city": "Haveri"
    })
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create product with 50 units
    prod_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Toor Dal 1kg",
        "purchase_cost": 110.0,
        "selling_price": 140.0,
        "initial_stock": 50.0
    })
    prod_id = prod_resp.json()["id"]

    # Start reconciliation session
    sess_resp = client.post("/api/v1/reconciliation/sessions", headers=headers, json={"notes": "Monthly physical audit"})
    assert sess_resp.status_code == 200
    sess_id = sess_resp.json()["id"]

    # Record physical count: 47 units counted (3 units shortage / damaged)
    count_resp = client.post(
        f"/api/v1/reconciliation/sessions/{sess_id}/count",
        headers=headers,
        json={
            "product_id": prod_id,
            "counted_quantity": 47.0,
            "reason_code": "DAMAGED",
            "notes": "Moisture damage found during audit"
        }
    )
    assert count_resp.status_code == 200
    item_data = count_resp.json()
    assert item_data["expected_quantity"] == 50.0
    assert item_data["counted_quantity"] == 47.0
    assert item_data["variance_quantity"] == -3.0
    assert item_data["variance_value"] == -330.0  # -3 * 110

    # Stock before approval is still 50
    p_before = client.get(f"/api/v1/products/{prod_id}", headers=headers).json()
    assert p_before["current_stock"] == 50.0

    # Approve reconciliation
    appr_resp = client.post(f"/api/v1/reconciliation/sessions/{sess_id}/approve", headers=headers)
    assert appr_resp.status_code == 200
    assert appr_resp.json()["status"] == "COMPLETED"

    # Stock after approval is adjusted to 47
    p_after = client.get(f"/api/v1/products/{prod_id}", headers=headers).json()
    assert p_after["current_stock"] == 47.0

def test_financial_analytics_reconciliation(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "finance_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Finance Head",
        "business_name": "Finance Test Store",
        "city": "Haveri"
    })
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Product: 20 units at cost 50, price 80
    p_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Wheat Flour 5kg",
        "purchase_cost": 50.0,
        "selling_price": 80.0,
        "initial_stock": 20.0
    })
    p_id = p_resp.json()["id"]

    # Sell 4 units
    client.post("/api/v1/invoices/", headers=headers, json={
        "items": [{"product_id": p_id, "quantity": 4.0, "unit_price": 80.0, "discount_amount": 0.0}]
    })

    # Record electricity expense of ₹50
    client.post("/api/v1/expenses/", headers=headers, json={
        "category": "ELECTRICITY",
        "title": "Shop monthly power bill",
        "amount": 50.0
    })

    # Query financial summary
    sum_resp = client.get("/api/v1/analytics/summary", headers=headers)
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    # Gross sales = 4 * 80 = 320
    assert summary["gross_sales"] == 320.0
    assert summary["net_sales"] == 320.0
    # COGS = 4 * 50 = 200
    assert summary["cost_of_goods_sold"] == 200.0
    # Gross profit = 320 - 200 = 120
    assert summary["gross_profit"] == 120.0
    assert summary["operating_expenses"] == 50.0
    # Operating profit = 120 - 50 = 70
    assert summary["operating_profit"] == 70.0
    # Remaining units: 20 - 4 = 16. Valuation: 16 * 50 = 800
    assert summary["total_stock_units"] == 16.0
    assert summary["inventory_valuation"] == 800.0

def test_offline_sync_and_anomalies(client: TestClient):
    resp = client.post("/api/v1/auth/register", json={
        "email": "sync_test@smartstock.in",
        "password": "Password123!",
        "full_name": "Sync Tester",
        "business_name": "Offline Mart",
        "city": "Haveri"
    })
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Product
    p_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Biscuits 100g",
        "purchase_cost": 15.0,
        "selling_price": 20.0,
        "initial_stock": 50.0
    })
    p_id = p_resp.json()["id"]

    # Push offline item
    client_uuid = "client-offline-uuid-999"
    sync_payload = {
        "items": [
            {
                "client_uuid": client_uuid,
                "action_type": "CREATE_INVOICE",
                "payload": {
                    "payment_method": "CASH",
                    "items": [{"product_id": p_id, "quantity": 2.0, "unit_price": 20.0, "discount_amount": 0.0}]
                },
                "created_at_client": "2026-10-15T12:00:00"
            }
        ]
    }

    sync_resp = client.post("/api/v1/sync/push", headers=headers, json=sync_payload)
    assert sync_resp.status_code == 200
    res_data = sync_resp.json()
    assert res_data["processed_count"] == 1
    assert res_data["results"][0]["status"] == "PROCESSED"

    # Push duplicate: should be skipped
    sync_resp2 = client.post("/api/v1/sync/push", headers=headers, json=sync_payload)
    assert sync_resp2.status_code == 200
    res_data2 = sync_resp2.json()
    assert res_data2["skipped_count"] == 1
    assert res_data2["results"][0]["status"] == "DUPLICATE_SKIPPED"

def test_staff_management_operations(client: TestClient):
    # Register Owner
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "owner_staff_test@smartstock.in",
        "password": "OwnerPassword123!",
        "full_name": "Kirana Owner",
        "business_name": "Shree Manjunatha Stores",
        "city": "Haveri"
    })
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. List staff initially (should have 1 member: the owner)
    list_resp = client.get("/api/v1/businesses/staff", headers=headers)
    assert list_resp.status_code == 200
    staff_list = list_resp.json()
    assert len(staff_list) == 1
    owner_membership_id = staff_list[0]["id"]
    assert staff_list[0]["role"] == "OWNER"

    # 2. Invite a new Cashier
    invite_resp = client.post("/api/v1/businesses/staff", headers=headers, json={
        "full_name": "Ramesh Cashier",
        "email": "ramesh_cashier@smartstock.in",
        "phone": "9876543210",
        "role": "CASHIER",
        "temp_password": "cashier_pin_1234"
    })
    assert invite_resp.status_code == 200
    cashier_m = invite_resp.json()
    cashier_m_id = cashier_m["id"]
    assert cashier_m["role"] == "CASHIER"
    assert cashier_m["phone"] == "9876543210"
    assert cashier_m["is_active"] is True

    # 3. Update staff: promote Cashier to MANAGER
    update_resp = client.put(f"/api/v1/businesses/staff/{cashier_m_id}", headers=headers, json={
        "role": "MANAGER"
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["role"] == "MANAGER"

    # 4. Suspend staff: set is_active=False
    suspend_resp = client.put(f"/api/v1/businesses/staff/{cashier_m_id}", headers=headers, json={
        "is_active": False
    })
    assert suspend_resp.status_code == 200
    assert suspend_resp.json()["is_active"] is False

    # 5. Reset staff password/PIN
    reset_resp = client.post(f"/api/v1/businesses/staff/{cashier_m_id}/reset-password", headers=headers, json={
        "new_password": "NewSecurePin8899"
    })
    assert reset_resp.status_code == 200
    assert "reset successfully" in reset_resp.json()["message"]

    # 6. Safety check: Owner cannot remove themselves
    del_self_resp = client.delete(f"/api/v1/businesses/staff/{owner_membership_id}", headers=headers)
    assert del_self_resp.status_code == 400
    assert "cannot remove your own active owner membership" in del_self_resp.json()["detail"]

    # 7. Owner removes staff member
    del_resp = client.delete(f"/api/v1/businesses/staff/{cashier_m_id}", headers=headers)
    assert del_resp.status_code == 200
    assert "removed from this store" in del_resp.json()["message"]

    # Verify staff count is back to 1
    final_list_resp = client.get("/api/v1/businesses/staff", headers=headers)
    assert len(final_list_resp.json()) == 1

def test_audit_logs_and_export(client: TestClient):
    # Register Owner
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "audit_test_owner@smartstock.in",
        "password": "Password123!",
        "full_name": "Audit Inspector",
        "business_name": "Audit Verification Mart",
        "city": "Haveri"
    })
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a product (generates an audit log)
    p_resp = client.post("/api/v1/products/", headers=headers, json={
        "name": "Audit Test Rice 10kg",
        "purchase_cost": 400.0,
        "selling_price": 500.0,
        "initial_stock": 20.0
    })
    assert p_resp.status_code == 200

    # 2. Query audit summary
    sum_resp = client.get("/api/v1/audit/summary", headers=headers)
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    assert summary["total_events"] >= 2  # REGISTER + CREATE_PRODUCT
    assert summary["today_events"] >= 2
    assert summary["unique_users_count"] >= 1

    # 3. Query audit logs with search filter
    list_resp = client.get("/api/v1/audit/?search=Audit", headers=headers)
    assert list_resp.status_code == 200
    logs = list_resp.json()
    assert len(logs) >= 1
    assert any("Audit Test Rice" in (l["details_json"] or "") or l["user_name"] == "Audit Inspector" for l in logs)
    assert logs[0]["user_role"] == "OWNER"

    # 4. Export CSV
    csv_resp = client.get("/api/v1/audit/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "Log ID,Timestamp (UTC),Action Performed" in csv_resp.text


