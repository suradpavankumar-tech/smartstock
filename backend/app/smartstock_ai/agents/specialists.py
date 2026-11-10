from typing import Dict, List

SPECIALIST_AGENTS: List[Dict[str, str]] = [
    {
        "agent_name": "InventoryIntelligenceAgent",
        "agent_role": "Inventory, Batch Expiry & Stock Ledger Specialist",
        "domain": "Inventory",
        "description": "Monitors stock levels, stockouts, reorder thresholds, FEFO batch expiries, and stagnant inventory.",
    },
    {
        "agent_name": "SalesIntelligenceAgent",
        "agent_role": "Sales Velocity & Basket Performance Analyst",
        "domain": "Sales",
        "description": "Computes daily run-rates, bill volume, average order value, category mix, and SKU sales trends.",
    },
    {
        "agent_name": "FinancialAnalysisAgent",
        "agent_role": "P&L, Margin & Operating Cost Controller",
        "domain": "Finance",
        "description": "Decomposes gross/operating profit changes, COGS shifts, discounts, expense spikes, and GST summaries.",
    },
    {
        "agent_name": "PurchaseManagementAgent",
        "agent_role": "Procurement Planning & PO Draft Architect",
        "domain": "Purchasing",
        "description": "Calculates target restock quantities snapped to MOQ and compiles supplier-grouped PO drafts.",
    },
    {
        "agent_name": "SupplierIntelligenceAgent",
        "agent_role": "Vendor Cost & Lead-Time Evaluator",
        "domain": "Suppliers",
        "description": "Compares supplier unit cost history, lead times, fulfillment stats, and cost-saving switches.",
    },
    {
        "agent_name": "CustomerIntelligenceAgent",
        "agent_role": "Khata Credit & Receivables Specialist",
        "domain": "Customers",
        "description": "Tracks customer outstanding Khata dues, overdue invoices, and cash collection priorities.",
    },
    {
        "agent_name": "ForecastingAgent",
        "agent_role": "Predictive Time-Series & Stockout Modeler",
        "domain": "Forecasting",
        "description": "Evaluates exponential smoothing & moving-average ensembles with confidence intervals and data sufficiency checks.",
    },
    {
        "agent_name": "BusinessStrategyAgent",
        "agent_role": "Working Capital & Scenario Strategist",
        "domain": "Strategy",
        "description": "Assesses cash tie-up, pricing elasticity, demand surges, and supplier disruption trade-offs.",
    },
    {
        "agent_name": "DocumentIntelligenceAgent",
        "agent_role": "Invoice, Quote & Spreadsheet Parser",
        "domain": "Documents",
        "description": "Extracts line items from CSV/XLSX/invoices/images, verifies totals, and reconciles catalog SKUs.",
    },
    {
        "agent_name": "ReportingAgent",
        "agent_role": "Executive Briefing, Multilingual & Governance Reporter",
        "domain": "Reporting",
        "description": "Synthesizes daily briefings, explainable evidence, audit trails, and English/Kannada/Hindi outputs.",
    },
]

SPECIALIST_MAP: Dict[str, Dict[str, str]] = {a["agent_name"]: a for a in SPECIALIST_AGENTS}
