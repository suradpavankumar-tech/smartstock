export type Role = "OWNER" | "MANAGER" | "CASHIER";

export type PaymentMethod = "CASH" | "UPI" | "CARD" | "CREDIT" | "SPLIT";
export type TaxMode = "REGULAR_GST" | "COMPOSITION_SCHEME" | "NON_GST_RETAIL";

export type InvoiceStatus = "COMPLETED" | "CANCELLED" | "REFUNDED";

export type POStatus = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "COMPLETED" | "CANCELLED";

export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AnomalyStatus = "PENDING_REVIEW" | "RESOLVED" | "DISMISSED";

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  is_active: boolean;
  is_superuser: boolean;
}

export interface BusinessSummary {
  id: number;
  name: string;
  role: Role;
  city: string;
  district: string;
  gstin?: string;
}

export interface StaffMember {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Business {
  id: number;
  name: string;
  legal_name?: string;
  gstin?: string;
  phone?: string;
  email?: string;
  address_line?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  currency: string;
  timezone: string;
  locale: string;
  tax_mode: TaxMode;
  upi_vpa?: string;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: number;
  business_id: number;
  name: string;
  section_name: string;
  description?: string;
  is_archived: boolean;
  created_at: string;
  product_count?: number;
}

export interface Product {
  id: number;
  business_id: number;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  category_id?: number;
  category_name?: string;
  section_name?: string;
  supplier_id?: number;
  supplier_name?: string;
  unit: string;
  purchase_cost: number;
  selling_price: number;
  tax_rate_percent: number;
  current_stock: number;
  reorder_threshold: number;
  min_order_qty: number;
  is_archived: boolean;
  is_low_stock?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ProductBatch {
  id: number;
  batch_number: string;
  quantity: number;
  purchase_cost: number;
  expiry_date?: string;
  received_date: string;
  is_active: boolean;
  product_id?: number;
  product_name?: string;
  days_until_expiry?: number;
}

export interface StockMovement {
  id: number;
  business_id: number;
  product_id: number;
  product_name?: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  unit_cost: number;
  total_cost: number;
  reference_type?: string;
  reference_id?: string;
  reason?: string;
  notes?: string;
  created_by_user_id?: number;
  created_by_name?: string;
  created_at: string;
}

export interface InvoiceItem {
  id?: number;
  product_id: number;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  tax_rate_percent: number;
  tax_amount: number;
  total_amount: number;
}

export interface Invoice {
  id: number;
  business_id: number;
  invoice_number: string;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  created_by_user_id?: number;
  created_by_name?: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  total_cost: number;
  paid_amount?: number;
  credit_amount?: number;
  payment_method: PaymentMethod;
  payment_status: string;
  status: InvoiceStatus;
  notes?: string;
  created_at: string;
  items: InvoiceItem[];
}

export interface Supplier {
  id: number;
  business_id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  lead_time_days: number;
  payment_terms_days: number;
  is_active: string;
  created_at: string;
  order_count?: number;
  fulfillment_rate_percent?: number;
}

export interface POItem {
  id: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  tax_rate_percent: number;
  total_cost: number;
}

export interface PurchaseOrder {
  id: number;
  business_id: number;
  supplier_id: number;
  supplier_name?: string;
  supplier_phone?: string;
  supplier_email?: string;
  po_number: string;
  status: POStatus;
  order_date: string;
  expected_delivery_date?: string;
  received_date?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  created_at: string;
  items: POItem[];
}

export interface Customer {
  id: number;
  business_id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  outstanding_balance: number;
  created_at: string;
}

export interface Expense {
  id: number;
  business_id: number;
  category: string;
  title: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
}

export interface CashShift {
  id: number;
  business_id: number;
  user_id: number;
  opening_float: number;
  cash_sales: number;
  cash_expenses: number;
  cash_refunds: number;
  expected_cash: number;
  counted_cash?: number;
  variance?: number;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at?: string;
}

export interface FinancialSummary {
  start_date: string;
  end_date: string;
  gross_sales: number;
  discounts: number;
  returns: number;
  net_sales: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  gross_margin_percent: number;
  operating_expenses: number;
  operating_profit: number;
  total_invoices_count: number;
  average_order_value: number;
  inventory_valuation: number;
  total_stock_units: number;
  low_stock_products_count: number;
}

export interface DailySalesPoint {
  date: string;
  sales: number;
  cost: number;
  profit: number;
  invoices: number;
}

export interface ProductPerformancePoint {
  product_id: number;
  product_name: string;
  category_name?: string;
  units_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  margin_percent: number;
}

export interface CategoryPerformancePoint {
  category_id?: number;
  category_name: string;
  units_sold: number;
  revenue: number;
  revenue_percentage: number;
}

export interface StockAgeingCohort {
  cohort_name: string;
  product_count: number;
  total_units: number;
  total_tied_up_capital: number;
}

export interface StockAgeingProduct {
  product_id: number;
  product_name: string;
  current_stock: number;
  unit_cost: number;
  inventory_value: number;
  days_since_last_sale: number;
  status: string;
}

export interface StockAgeingReport {
  cohorts: StockAgeingCohort[];
  slow_and_dead_products: StockAgeingProduct[];
  total_dead_stock_value: number;
}

export interface ForecastDailyPoint {
  day_offset: number;
  date: string;
  day_name: string;
  projected_demand: number;
  lower_bound: number;
  upper_bound: number;
}

export interface ProductForecastReport {
  product_id: number;
  product_name: string;
  sku?: string;
  category_name?: string;
  unit: string;
  current_stock: number;
  status: string;
  confidence_level: string;
  model_name: string;
  daily_velocity: number;
  days_of_sales_history: number;
  required_history_days: number;
  forecast_7d?: number;
  forecast_14d?: number;
  forecast_30d?: number;
  stockout_risk_days?: number;
  explanation: string;
}

export interface ForecastItemDetail {
  product_id: number;
  product_name: string;
  status: string;
  horizon_days: number;
  forecast_quantity: number;
  lower_bound: number;
  upper_bound: number;
  historical_daily_avg: number;
  daily_run_rate: number;
  selected_model: string;
  confidence_level: string;
  mae?: number;
  wape?: number;
  model_version: string;
  trained_at?: string;
  stockout_risk_days?: number;
  explanation: string;
  daily_projections: ForecastDailyPoint[];
}

export interface ReorderRecommendation {
  product_id: number;
  product_name: string;
  sku?: string | null;
  current_stock: number;
  incoming_po_stock: number;
  effective_stock: number;
  avg_daily_demand: number;
  supplier_lead_time_days: number;
  lead_time_demand: number;
  safety_stock: number;
  reorder_point: number;
  recommended_order_qty: number;
  min_order_qty: number;
  unit: string;
  unit_cost: number;
  estimated_cost: number;
  supplier_id?: number | null;
  supplier_name?: string | null;
  urgency_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "HEALTHY";
  stockout_risk_days?: number | null;
  needs_reorder: boolean;
  reason: string;
  is_forecast_backed: boolean;
}

export interface ReconciliationItem {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  barcode?: string;
  unit: string;
  expected_quantity: number;
  counted_quantity: number;
  variance_quantity: number;
  unit_cost: number;
  variance_value: number;
  reason_code?: string;
  adjustment_applied: boolean;
  notes?: string;
}

export interface ReconciliationSession {
  id: number;
  business_id: number;
  session_code: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  notes?: string;
  started_at: string;
  completed_at?: string;
  created_by_name?: string;
  total_items_counted?: number;
  total_variance_value?: number;
}

export interface AnomalyAlert {
  id: number;
  business_id: number;
  alert_type: string;
  severity: AnomalySeverity;
  description: string;
  entity_type?: string;
  entity_id?: string;
  status: AnomalyStatus;
  resolution_notes?: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by_name?: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  user_name?: string;
  user_role?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details_json?: string;
  ip_address?: string;
  created_at: string;
  is_high_risk?: boolean;
}

export interface AuditSummary {
  total_events: number;
  today_events: number;
  cancelled_invoices_count: number;
  stock_adjustments_count: number;
  security_events_count: number;
  unique_users_count: number;
}

export interface AssistantMetricCard {
  label: string;
  value: string;
  subtext?: string;
  status: "positive" | "warning" | "critical" | "neutral";
}

export interface AssistantDataTable {
  title: string;
  columns: string[];
  rows: any[][];
}

export interface AssistantResponse {
  query: string;
  intent: string;
  model_name?: string;
  confidence_score?: number;
  latency_ms?: number;
  thinking_steps?: string[];
  executive_summary?: string;
  answer_text: string;
  metric_cards?: AssistantMetricCard[];
  data_table?: AssistantDataTable;
  actionable_recommendations?: string[];
  metric_definition: string;
  date_range_explained: string;
  supporting_data?: any;
  drilldown_route: string;
  data_limitation_notes: string;
  source_tables?: string[];
}

export interface Gstr1B2bItem {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_gstin: string;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface Gstr1B2csItem {
  tax_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
  invoice_count: number;
}

export interface Gstr1HsnItem {
  product_name: string;
  sku?: string;
  unit: string;
  total_quantity: number;
  tax_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
}

export interface Gstr1Summary {
  start_date: string;
  end_date: string;
  total_invoices: number;
  cancelled_invoices: number;
  net_invoices: number;
  first_invoice_number?: string;
  last_invoice_number?: string;
  total_taxable_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_tax: number;
  grand_total: number;
}

export interface Gstr1ReportOut {
  summary: Gstr1Summary;
  b2b: Gstr1B2bItem[];
  b2cs: Gstr1B2csItem[];
  hsn_summary: Gstr1HsnItem[];
}

export interface AgentChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentFunctionSpec {
  name: string;
  label: string;
  description: string;
  category: string;
  status: "ACTIVE" | "SLOT_READY";
  example_prompt?: string | null;
}

export interface AgentToolCall {
  tool_name: string;
  label: string;
  status: "COMPLETED" | "UNBOUND" | "ERROR";
  summary: string;
  duration_ms: number;
}

export interface AgentMetricItem {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "warning" | "critical" | "info";
}

export interface AgentAction {
  label: string;
  target_tab?: string | null;
  prompt?: string | null;
}

export interface AgentCapabilities {
  agent_name: string;
  workspace_name: string;
  role: string;
  runtime_status: string;
  functions: AgentFunctionSpec[];
}

export interface AgentChatResponse {
  reply: string;
  intent: string;
  tool_calls: AgentToolCall[];
  metrics: AgentMetricItem[];
  actions: AgentAction[];
  functions: AgentFunctionSpec[];
  latency_ms: number;
}

// ============================================================
// SMARTSTOCK AI ULTRA TYPES
// ============================================================

export type AIModeType = "QUICK_ASSIST" | "DEEP_ANALYSIS" | "AGENT";
export type AILanguageType = "auto" | "en" | "kn" | "hi";
export type AIDataType = "ACTUAL" | "FORECAST" | "HYPOTHETICAL_SIMULATION";

export interface AIKpiMetric {
  label: string;
  value: string;
  delta?: string | null;
  tone: "neutral" | "positive" | "warning" | "critical" | "info";
  data_type: AIDataType;
}

export interface AIChartPoint {
  label: string;
  value: number;
  secondary_value?: number | null;
  color?: string | null;
}

export interface AIChartSpec {
  chart_id: string;
  title: string;
  subtitle?: string | null;
  chart_type: "bar" | "line" | "donut";
  unit_prefix: string;
  unit_suffix: string;
  data_type: AIDataType;
  series_label: string;
  secondary_label?: string | null;
  points: AIChartPoint[];
}

export interface AITableSpec {
  table_id: string;
  title: string;
  columns: string[];
  rows: string[][];
  highlight_col?: number | null;
}

export interface AIEvidenceItem {
  source: string;
  label: string;
  value: string;
  record_count?: number | null;
  data_type: AIDataType;
}

export interface AISpecialistTrace {
  agent_name: string;
  agent_role: string;
  status: string;
  summary: string;
  confidence: number;
  duration_ms: number;
}

export interface AIToolTrace {
  tool_name: string;
  agent_name?: string | null;
  label: string;
  status: "COMPLETED" | "DENIED" | "ERROR";
  is_mutating: boolean;
  summary: string;
  duration_ms: number;
}

export interface AIActionShortcut {
  label: string;
  target_tab?: string | null;
  prompt?: string | null;
  mode?: AIModeType | null;
}

export interface AIApproval {
  id: number;
  business_id: number;
  conversation_id?: number | null;
  task_id?: number | null;
  action_type: string;
  title: string;
  summary: string;
  preview: Record<string, any>;
  idempotency_key: string;
  status: "PENDING" | "EXECUTED" | "REJECTED" | "FAILED" | string;
  decision_note?: string | null;
  execution_result?: Record<string, any> | null;
  created_at: string;
  decided_at?: string | null;
  executed_at?: string | null;
}

export interface AIConversation {
  id: number;
  business_id: number;
  user_id: number;
  title: string;
  mode: string;
  language: string;
  context_summary?: string | null;
  last_message_at: string;
  created_at: string;
  message_count: number;
}

export interface AIMessagePayload {
  kpis: AIKpiMetric[];
  charts: AIChartSpec[];
  tables: AITableSpec[];
  evidence: AIEvidenceItem[];
  assumptions: string[];
  recommendations: string[];
  agents_involved: AISpecialistTrace[];
  tool_traces: AIToolTrace[];
  actions: AIActionShortcut[];
  approval_ids: number[];
  approvals: AIApproval[];
  follow_ups: string[];
  data_quality?: string | null;
  llm_provider: string;
}

export interface AIMessage {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | string;
  content: string;
  mode: string;
  language: string;
  intent?: string | null;
  confidence: number;
  payload: AIMessagePayload;
  tokens_used: number;
  latency_ms: number;
  created_at: string;
}

export interface AIChatResponse {
  conversation_id: number;
  user_message: AIMessage;
  assistant_message: AIMessage;
  detected_language: string;
  task_id?: number | null;
  status: string;
}

export interface AIMemory {
  id: number;
  business_id: number;
  memory_key: string;
  memory_value: string;
  category: "PREFERENCE" | "SUPPLIER" | "INVENTORY_RULE" | "REPORTING" | "GENERAL" | string;
  is_active: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface AIWorkflow {
  id: number;
  business_id: number;
  name: string;
  natural_language_rule: string;
  trigger_type: "SCHEDULED" | "EVENT" | "MANUAL" | string;
  schedule_cron?: string | null;
  condition: Record<string, any>;
  action: Record<string, any>;
  requires_approval: boolean;
  is_active: boolean;
  last_run_at?: string | null;
  last_run_summary?: string | null;
  run_count: number;
  created_at: string;
}

export interface AIAlert {
  id: number;
  business_id: number;
  alert_key: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
  title: string;
  what_happened: string;
  why_it_matters: string;
  supporting_data: Record<string, any>;
  recommended_action: string;
  recommended_tab?: string | null;
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED" | string;
  detected_at: string;
  resolved_at?: string | null;
}

export interface AIDocument {
  id: number;
  business_id: number;
  conversation_id?: number | null;
  filename: string;
  content_type: string;
  document_type: string;
  file_size_bytes: number;
  extraction_status: string;
  raw_excerpt?: string | null;
  extracted: Record<string, any>;
  created_at: string;
}

export interface AIRuntime {
  assistant_name: string;
  version: string;
  workspace_name: string;
  role: string;
  active_provider: string;
  external_llm_enabled: boolean;
  external_providers: Record<string, boolean>;
  supported_modes: string[];
  supported_languages: string[];
  specialists: { name: string; role: string; description?: string }[];
  allowed_tools: string[];
  restricted_tools: string[];
  pending_approvals_count: number;
  active_alerts_count: number;
}

export interface AIBriefing {
  generated_at: string;
  workspace_name: string;
  headline: string;
  summary_markdown: string;
  kpis: AIKpiMetric[];
  top_risks: AIAlert[];
  opportunities: string[];
  recommended_actions: AIActionShortcut[];
}

export interface AIObservability {
  total_tasks: number;
  total_messages: number;
  avg_latency_ms: number;
  total_tokens_used: number;
  approvals_pending: number;
  approvals_executed: number;
  approvals_rejected: number;
  active_alerts: number;
  benchmark_pass_rate?: number | null;
  recent_tasks: Record<string, any>[];
}

