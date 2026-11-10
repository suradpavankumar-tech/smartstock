import {
  User, Business, BusinessSummary, StaffMember, Role, Category, Product, ProductBatch, StockMovement,
  Invoice, Supplier, PurchaseOrder, Customer, Expense, FinancialSummary,
  DailySalesPoint, ProductPerformancePoint, CategoryPerformancePoint,
  StockAgeingReport, ProductForecastReport, ForecastItemDetail,
  ReorderRecommendation, ReconciliationSession, ReconciliationItem,
  AnomalyAlert, AuditLog, AuditSummary, AssistantResponse, CashShift,
  Gstr1ReportOut, AgentCapabilities, AgentChatResponse, AgentChatTurn,
  AIModeType, AILanguageType, AIRuntime, AIConversation, AIMessage,
  AIChatResponse, AIApproval, AIAlert, AIBriefing, AIDocument,
  AIMemory, AIWorkflow, AIObservability, AISpecialistTrace
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

class ApiService {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = localStorage.getItem("smartstock_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const businessId = localStorage.getItem("smartstock_active_business_id");
    if (businessId) {
      headers["X-Business-ID"] = businessId;
    }
    return headers;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = { ...this.getHeaders(), ...(options.headers || {}) };

    try {
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        // Clear expired auth session
        localStorage.removeItem("smartstock_token");
        window.dispatchEvent(new Event("auth:logout"));
        throw new Error("Session expired. Please log in again.");
      }
      if (!response.ok) {
        let errorDetail = `Request failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.detail) {
            if (Array.isArray(errJson.detail)) {
              errorDetail = errJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
            } else if (typeof errJson.detail === "string") {
              errorDetail = errJson.detail;
            } else {
              errorDetail = JSON.stringify(errJson.detail);
            }
          }
        } catch (_) {}
        throw new Error(errorDetail);
      }
      return await response.json();
    } catch (err: any) {
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        throw new Error("Network unavailable. Please check your internet connection.");
      }
      throw err;
    }
  }

  // --- Auth & Tenant ---
  async login(email: string, password: string):Promise<{ access_token: string; user_id: number; business_id: number; role: string; business_name: string }> {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: any): Promise<{ access_token: string; user_id: number; business_id: number; role: string; business_name: string }> {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMe(): Promise<{ user: User; current_business: BusinessSummary; businesses: BusinessSummary[] }> {
    return this.request("/auth/me");
  }

  async switchBusiness(businessId: number): Promise<{ access_token: string; business_id: number; business_name: string }> {
    return this.request("/auth/switch-business", {
      method: "POST",
      body: JSON.stringify({ business_id: businessId }),
    });
  }

  // --- Business Profile & Staff ---
  async getBusinessProfile(): Promise<Business> {
    return this.request("/businesses/profile");
  }

  async updateBusinessProfile(data: Partial<Business>): Promise<Business> {
    return this.request("/businesses/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getStaff(): Promise<StaffMember[]> {
    return this.request("/businesses/staff");
  }

  async inviteStaff(data: { email: string; full_name: string; phone?: string; role: Role; temp_password?: string }): Promise<StaffMember> {
    return this.request("/businesses/staff", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateStaff(membershipId: number, data: { role?: Role; is_active?: boolean }): Promise<StaffMember> {
    return this.request(`/businesses/staff/${membershipId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async resetStaffPassword(membershipId: number, newPassword: string): Promise<{ message: string }> {
    return this.request(`/businesses/staff/${membershipId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    });
  }

  async removeStaff(membershipId: number): Promise<{ message: string }> {
    return this.request(`/businesses/staff/${membershipId}`, {
      method: "DELETE",
    });
  }

  // --- Products & Categories ---
  async getProducts(params?: { search?: string; category_id?: number; section_name?: string; low_stock_only?: boolean; limit?: number }): Promise<Product[]> {
    const q = new URLSearchParams();
    if (params?.search) q.append("search", params.search);
    if (params?.category_id) q.append("category_id", params.category_id.toString());
    if (params?.section_name) q.append("section_name", params.section_name);
    if (params?.low_stock_only) q.append("low_stock_only", "true");
    if (params?.limit) q.append("limit", params.limit.toString());
    const qs = q.toString() ? `?${q.toString()}` : "";
    return this.request(`/products/${qs}`);
  }

  async createProduct(data: any): Promise<Product> {
    return this.request("/products/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: number, data: any): Promise<Product> {
    return this.request(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async archiveProduct(id: number): Promise<{ message: string }> {
    return this.request(`/products/${id}`, { method: "DELETE" });
  }

  async previewProductsCSV(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("smartstock_token");
    const res = await fetch(`${API_BASE_URL}/products/import/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Business-ID": localStorage.getItem("smartstock_active_business_id") || "",
      },
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to preview CSV");
    return res.json();
  }

  async executeProductsCSV(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("smartstock_token");
    const res = await fetch(`${API_BASE_URL}/products/import/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Business-ID": localStorage.getItem("smartstock_active_business_id") || "",
      },
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to import CSV");
    return res.json();
  }

  async getCategories(): Promise<Category[]> {
    return this.request("/categories/");
  }

  async createCategory(data: { name: string; section_name: string; description?: string }): Promise<Category> {
    return this.request("/categories/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCategory(id: number, data: { name?: string; section_name?: string; description?: string }): Promise<Category> {
    return this.request(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async archiveCategory(id: number): Promise<{ message: string }> {
    return this.request(`/categories/${id}`, {
      method: "DELETE",
    });
  }

  // --- Inventory Ledger & Alerts ---
  async getStockLedger(productId?: number): Promise<StockMovement[]> {
    const qs = productId ? `?product_id=${productId}` : "";
    return this.request(`/inventory/ledger${qs}`);
  }

  async adjustStock(data: { product_id: number; quantity_change: number; reason: string; notes?: string }): Promise<StockMovement> {
    return this.request("/inventory/adjust", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getLowStockAlerts(): Promise<any[]> {
    return this.request("/inventory/low-stock");
  }

  async getBatches(productId?: number): Promise<ProductBatch[]> {
    const qs = productId ? `?product_id=${productId}` : "";
    return this.request(`/inventory/batches${qs}`);
  }

  async getExpiringBatches(days: number = 30): Promise<ProductBatch[]> {
    return this.request(`/inventory/expiring-batches?days=${days}`);
  }

  async exportProductsCsv(): Promise<string> {
    const headers: Record<string, string> = { ...this.getHeaders() };
    delete headers["Content-Type"];
    const res = await fetch(`${API_BASE_URL}/products/export/csv`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      let msg = `Failed to export products CSV (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.detail) {
          msg = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // use status text
      }
      throw new Error(msg);
    }
    return res.text();
  }

  // --- Point of Sale & Billing ---
  async createInvoice(data: any): Promise<Invoice> {
    return this.request("/invoices/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getInvoices(search?: string, limit?: number): Promise<Invoice[]> {
    const q = new URLSearchParams();
    if (search) q.append("search", search);
    if (limit) q.append("limit", limit.toString());
    const qs = q.toString() ? `?${q.toString()}` : "";
    return this.request(`/invoices/${qs}`);
  }

  async cancelInvoice(id: number, reason: string): Promise<Invoice> {
    return this.request(`/invoices/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  // --- Purchases & Suppliers ---
  async getSuppliers(): Promise<Supplier[]> {
    return this.request("/suppliers/");
  }

  async createSupplier(data: any): Promise<Supplier> {
    return this.request("/suppliers/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSupplier(id: number, data: any): Promise<Supplier> {
    return this.request(`/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSupplier(id: number): Promise<{ message: string }> {
    return this.request(`/suppliers/${id}`, {
      method: "DELETE",
    });
  }

  async getPurchaseOrders(limit?: number): Promise<PurchaseOrder[]> {
    const qs = limit ? `?limit=${limit}` : "";
    return this.request(`/purchases/orders${qs}`);
  }

  async createPurchaseOrder(data: any): Promise<PurchaseOrder> {
    return this.request("/purchases/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async receivePurchaseOrder(poId: number, data: any): Promise<PurchaseOrder> {
    return this.request(`/purchases/orders/${poId}/receive`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // --- Customers & Expenses ---
  async getCustomers(search?: string): Promise<Customer[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request(`/customers/${qs}`);
  }

  async createCustomer(data: any): Promise<Customer> {
    return this.request("/customers/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(id: number, data: { name?: string; phone?: string; email?: string; address?: string; gstin?: string }): Promise<Customer> {
    return this.request(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async recordCustomerPayment(customerId: number, data: { amount: number; payment_method?: string; note?: string }): Promise<Customer> {
    return this.request(`/customers/${customerId}/payment`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCustomerInvoices(customerId: number): Promise<Invoice[]> {
    return this.request(`/customers/${customerId}/invoices`);
  }

  async getExpenses(): Promise<Expense[]> {
    return this.request("/expenses/");
  }

  async createExpense(data: any): Promise<Expense> {
    return this.request("/expenses/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteExpense(id: number): Promise<{ message: string }> {
    return this.request(`/expenses/${id}`, {
      method: "DELETE",
    });
  }

  // --- Cash Drawer Shifts ---
  async getCurrentCashShift(): Promise<CashShift | null> {
    return this.request("/cash-drawer/current");
  }

  async openCashShift(opening_float: number): Promise<CashShift> {
    return this.request("/cash-drawer/open", {
      method: "POST",
      body: JSON.stringify({ opening_float }),
    });
  }

  async closeCashShift(counted_cash: number): Promise<CashShift> {
    return this.request("/cash-drawer/close", {
      method: "POST",
      body: JSON.stringify({ counted_cash }),
    });
  }

  // --- Financial Analytics ---
  async getFinancialSummary(startDate?: string, endDate?: string): Promise<FinancialSummary> {
    const q = new URLSearchParams();
    if (startDate) q.append("start_date", startDate);
    if (endDate) q.append("end_date", endDate);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return this.request(`/analytics/summary${qs}`);
  }

  async getDailySales(days: number = 14): Promise<DailySalesPoint[]> {
    return this.request(`/analytics/daily-sales?days=${days}`);
  }

  async getTopProducts(limit: number = 10): Promise<ProductPerformancePoint[]> {
    return this.request(`/analytics/top-products?limit=${limit}`);
  }

  async getCategoryPerformance(): Promise<CategoryPerformancePoint[]> {
    return this.request("/analytics/categories");
  }

  async getStockAgeing(): Promise<StockAgeingReport> {
    return this.request("/analytics/stock-ageing");
  }

  async getGstr1Report(startDate?: string, endDate?: string): Promise<Gstr1ReportOut> {
    const q = new URLSearchParams();
    if (startDate) q.append("start_date", startDate);
    if (endDate) q.append("end_date", endDate);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return this.request(`/analytics/gstr1-report${qs}`);
  }

  async downloadGstr1Csv(startDate?: string, endDate?: string): Promise<void> {
    const q = new URLSearchParams();
    if (startDate) q.append("start_date", startDate);
    if (endDate) q.append("end_date", endDate);
    const qs = q.toString() ? `?${q.toString()}` : "";
    const url = `${API_BASE_URL}/analytics/gstr1-export/csv${qs}`;
    const headers = this.getHeaders();
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error("Failed to download GSTR-1 CSV");
    const blob = await resp.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `GSTR1_Sales_Report_${startDate || "period"}_${endDate || ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  }

  // --- Forecasting & ML ---
  async getForecastingOverview(): Promise<ProductForecastReport[]> {
    return this.request("/forecasting/overview");
  }

  async getProductForecastDetail(productId: number, horizonDays: number = 7): Promise<ForecastItemDetail> {
    return this.request(`/forecasting/products/${productId}?horizon_days=${horizonDays}`);
  }

  // --- Replenishment Recommendations ---
  async getRecommendations(allItems: boolean = true): Promise<ReorderRecommendation[]> {
    return this.request(`/recommendations/?all_items=${allItems}`);
  }

  async convertRecommendationsToPO(
    supplierId: number,
    productIds?: number[],
    items?: { product_id: number; quantity?: number }[],
    notes?: string
  ): Promise<PurchaseOrder> {
    return this.request("/recommendations/convert-to-po", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: supplierId,
        product_ids: productIds,
        items: items,
        notes: notes,
      }),
    });
  }

  // --- Reconciliation ---
  async getReconciliationSessions(): Promise<ReconciliationSession[]> {
    return this.request("/reconciliation/sessions");
  }

  async startReconciliationSession(notes?: string): Promise<ReconciliationSession> {
    return this.request("/reconciliation/sessions", {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  }

  async getReconciliationDetail(sessionId: number): Promise<{ session: ReconciliationSession; items: ReconciliationItem[] }> {
    return this.request(`/reconciliation/sessions/${sessionId}`);
  }

  async recordReconciliationCount(sessionId: number, data: { product_id: number; counted_quantity: number; reason_code?: string; notes?: string }): Promise<ReconciliationItem> {
    return this.request(`/reconciliation/sessions/${sessionId}/count`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async approveReconciliationSession(sessionId: number): Promise<ReconciliationSession> {
    return this.request(`/reconciliation/sessions/${sessionId}/approve`, { method: "POST" });
  }

  // --- Business Scenario Simulator ---
  async simulateDelay(delayDays: number = 5): Promise<any> {
    return this.request(`/simulator/delay?delay_days=${delayDays}`);
  }

  async simulateDemand(changePercent: number = 20): Promise<any> {
    return this.request(`/simulator/demand?change_percent=${changePercent}`);
  }

  async simulatePrice(productId?: number, priceChangePercent: number = 5, elasticity: number = -1.2): Promise<any> {
    const qs = productId ? `&product_id=${productId}` : "";
    return this.request(`/simulator/price?price_change_percent=${priceChangePercent}&elasticity=${elasticity}${qs}`);
  }

  // --- Natural Language Business Assistant ---
  async askAssistant(query: string): Promise<AssistantResponse> {
    return this.request("/assistant/query", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  // --- AI Agent & Chatbot Runtime ---
  async getAgentCapabilities(): Promise<AgentCapabilities> {
    return this.request("/agent/capabilities");
  }

  async chatWithAgent(
    message: string,
    history: AgentChatTurn[] = [],
    language: string = "en"
  ): Promise<AgentChatResponse> {
    return this.request("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, language }),
    });
  }

  // --- SmartStock AI Ultra (Agentic Business Intelligence & Operations) ---
  async getAiRuntime(): Promise<AIRuntime> {
    return this.request("/ai/runtime");
  }

  async getAiConversations(): Promise<AIConversation[]> {
    return this.request("/ai/conversations");
  }

  async createAiConversation(data?: {
    title?: string;
    mode?: AIModeType;
    language?: AILanguageType;
  }): Promise<AIConversation> {
    return this.request("/ai/conversations", {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  async deleteAiConversation(conversationId: number): Promise<{ message: string }> {
    return this.request(`/ai/conversations/${conversationId}`, {
      method: "DELETE",
    });
  }

  async getAiConversationMessages(conversationId: number): Promise<AIMessage[]> {
    return this.request(`/ai/conversations/${conversationId}/messages`);
  }

  async aiUltraChat(payload: {
    message: string;
    conversation_id?: number | null;
    mode?: AIModeType;
    language?: AILanguageType;
    document_id?: number | null;
    voice_input?: boolean;
  }): Promise<AIChatResponse> {
    return this.request("/ai/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async aiUltraChatStream(
    payload: {
      message: string;
      conversation_id?: number | null;
      mode?: AIModeType;
      language?: AILanguageType;
      document_id?: number | null;
      voice_input?: boolean;
    },
    callbacks: {
      onStatus?: (data: { stage: string; mode: string }) => void;
      onAgentStep?: (step: AISpecialistTrace) => void;
      onToken?: (delta: string) => void;
      onFinal?: (res: AIChatResponse) => void;
    },
    signal?: AbortSignal
  ): Promise<AIChatResponse> {
    const url = `${API_BASE_URL}/ai/chat/stream`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal,
    });

    if (response.status === 401) {
      localStorage.removeItem("smartstock_token");
      window.dispatchEvent(new Event("auth:logout"));
      throw new Error("Session expired. Please log in again.");
    }
    if (!response.ok || !response.body) {
      let detail = `Streaming request failed (${response.status})`;
      try {
        const err = await response.json();
        if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } catch {}
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResponse: AIChatResponse | null = null;

    const processRawEvent = (rawEvent: string) => {
      if (!rawEvent.trim()) return;
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) return;
      const jsonStr = dataLines.join("\n");
      try {
        const parsed = JSON.parse(jsonStr);
        if (eventName === "status") {
          callbacks.onStatus?.(parsed);
        } else if (eventName === "agent_step") {
          callbacks.onAgentStep?.(parsed);
        } else if (eventName === "token") {
          callbacks.onToken?.(parsed.delta || "");
        } else if (eventName === "final") {
          finalResponse = parsed as AIChatResponse;
          callbacks.onFinal?.(finalResponse);
        }
      } catch {
        // ignore partial/malformed frame
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const rawEvent of chunks) {
          processRawEvent(rawEvent);
        }
      }

      if (buffer.trim()) {
        for (const rawEvent of buffer.split("\n\n")) {
          processRawEvent(rawEvent);
        }
      }
    } catch (err: any) {
      if (signal?.aborted || err?.name === "AbortError") {
        throw new DOMException("Stream aborted", "AbortError");
      }
      throw err;
    }

    if (signal?.aborted) {
      throw new DOMException("Stream aborted", "AbortError");
    }

    if (!finalResponse) {
      throw new Error("AI stream closed before final payload arrived.");
    }
    return finalResponse;
  }

  async getAiApprovals(statusFilter?: string): Promise<AIApproval[]> {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    return this.request(`/ai/approvals${qs}`);
  }

  async approveAiAction(
    approvalId: number,
    note?: string,
    editedPayload?: Record<string, any>
  ): Promise<AIApproval> {
    return this.request(`/ai/approvals/${approvalId}/approve`, {
      method: "POST",
      body: JSON.stringify({ note, edited_payload: editedPayload }),
    });
  }

  async rejectAiAction(approvalId: number, note?: string): Promise<AIApproval> {
    return this.request(`/ai/approvals/${approvalId}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }

  async getAiAlerts(autoScan: boolean = true): Promise<AIAlert[]> {
    return this.request(`/ai/alerts?auto_scan=${autoScan ? "true" : "false"}`);
  }

  async scanAiAlerts(): Promise<AIAlert[]> {
    return this.request("/ai/alerts/scan", { method: "POST" });
  }

  async updateAiAlertStatus(
    alertId: number,
    status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED"
  ): Promise<AIAlert> {
    return this.request(`/ai/alerts/${alertId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  }

  async getAiBriefing(): Promise<AIBriefing> {
    return this.request("/ai/briefing");
  }

  async uploadAiDocument(
    file: File,
    documentType: string = "PURCHASE_INVOICE",
    conversationId?: number | null
  ): Promise<AIDocument> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", documentType);
    if (conversationId) {
      formData.append("conversation_id", String(conversationId));
    }
    const token = localStorage.getItem("smartstock_token");
    const businessId = localStorage.getItem("smartstock_active_business_id");
    const res = await fetch(`${API_BASE_URL}/ai/documents/upload`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(businessId ? { "X-Business-ID": businessId } : {}),
      },
      body: formData,
    });
    if (res.status === 401) {
      localStorage.removeItem("smartstock_token");
      window.dispatchEvent(new Event("auth:logout"));
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) {
      let detail = `Failed to upload document (${res.status})`;
      try {
        const err = await res.json();
        if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  }

  async getAiDocuments(): Promise<AIDocument[]> {
    return this.request("/ai/documents");
  }

  async getAiMemories(): Promise<AIMemory[]> {
    return this.request("/ai/memories");
  }

  async createAiMemory(data: {
    memory_key: string;
    memory_value: string;
    category: "PREFERENCE" | "SUPPLIER" | "INVENTORY_RULE" | "REPORTING" | "GENERAL";
  }): Promise<AIMemory> {
    return this.request("/ai/memories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteAiMemory(memoryId: number): Promise<{ message: string }> {
    return this.request(`/ai/memories/${memoryId}`, {
      method: "DELETE",
    });
  }

  async getAiWorkflows(): Promise<AIWorkflow[]> {
    return this.request("/ai/workflows");
  }

  async createAiWorkflow(data: {
    name: string;
    natural_language_rule: string;
    trigger_type?: "SCHEDULED" | "EVENT" | "MANUAL";
    schedule_cron?: string;
    requires_approval?: boolean;
  }): Promise<AIWorkflow> {
    return this.request("/ai/workflows", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async toggleAiWorkflow(
    workflowId: number,
    data: { is_active?: boolean; requires_approval?: boolean }
  ): Promise<AIWorkflow> {
    return this.request(`/ai/workflows/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async runAiWorkflow(workflowId: number): Promise<any> {
    return this.request(`/ai/workflows/${workflowId}/run`, {
      method: "POST",
    });
  }

  async deleteAiWorkflow(workflowId: number): Promise<{ message: string }> {
    return this.request(`/ai/workflows/${workflowId}`, {
      method: "DELETE",
    });
  }

  async getAiObservability(): Promise<AIObservability> {
    return this.request("/ai/observability");
  }

  // --- Anomalies ---
  async getAnomalies(): Promise<AnomalyAlert[]> {
    return this.request("/anomalies/");
  }

  async resolveAnomaly(alertId: number, status: string, notes: string): Promise<AnomalyAlert> {
    return this.request(`/anomalies/${alertId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status, resolution_notes: notes }),
    });
  }

  // --- Offline Sync & Audit ---
  async pushSyncQueue(items: any[]): Promise<any> {
    return this.request("/sync/push", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  }

  async getSyncStatus(): Promise<any> {
    return this.request("/sync/status");
  }

  async getAuditLogs(params?: {
    action?: string;
    entity_type?: string;
    user_id?: number;
    search?: string;
    high_risk_only?: boolean;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    const q = new URLSearchParams();
    if (params?.action && params.action !== "ALL") q.append("action", params.action);
    if (params?.entity_type && params.entity_type !== "ALL") q.append("entity_type", params.entity_type);
    if (params?.user_id) q.append("user_id", params.user_id.toString());
    if (params?.search) q.append("search", params.search);
    if (params?.high_risk_only) q.append("high_risk_only", "true");
    if (params?.date_from) q.append("date_from", params.date_from);
    if (params?.date_to) q.append("date_to", params.date_to);
    if (params?.limit) q.append("limit", params.limit.toString());
    const qs = q.toString() ? `?${q.toString()}` : "";
    return this.request(`/audit/${qs}`);
  }

  async getAuditSummary(): Promise<AuditSummary> {
    return this.request("/audit/summary");
  }

  async downloadAuditCSV(params?: {
    action?: string;
    entity_type?: string;
    high_risk_only?: boolean;
  }): Promise<void> {
    const q = new URLSearchParams();
    if (params?.action && params.action !== "ALL") q.append("action", params.action);
    if (params?.entity_type && params.entity_type !== "ALL") q.append("entity_type", params.entity_type);
    if (params?.high_risk_only) q.append("high_risk_only", "true");
    const qs = q.toString() ? `?${q.toString()}` : "";

    const token = localStorage.getItem("smartstock_token");
    const bizId = localStorage.getItem("smartstock_active_business_id");
    const res = await fetch(`${API_BASE_URL}/audit/export/csv${qs}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Business-ID": bizId || "",
      },
    });
    if (!res.ok) throw new Error("Failed to export audit logs");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartstock_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export const api = new ApiService();
