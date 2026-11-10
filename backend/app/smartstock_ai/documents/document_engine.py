import base64
import csv
import io
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Dict, List, Optional, Tuple
import httpx
try:
    from PIL import Image  # type: ignore
except Exception:
    Image = None  # type: ignore
from sqlalchemy.orm import Session

from app.config import settings
from app.models.product import Product
from app.models.purchase import Supplier


def _read_xlsx_rows(raw_bytes: bytes) -> List[List[str]]:
    """Dependency-free pure-stdlib XLSX sheet1 parser via zipfile + XML."""
    rows: List[List[str]] = []
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root:
                texts = [el.text or "" for el in si.iter() if el.tag.endswith("}t") or el.tag == "t"]
                shared_strings.append("".join(texts))

        sheet_name = next((n for n in sorted(zf.namelist()) if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")), None)
        if not sheet_name:
            return []

        s_root = ET.fromstring(zf.read(sheet_name))
        for row_el in s_root.iter():
            if not (row_el.tag.endswith("}row") or row_el.tag == "row"):
                continue
            row_vals: List[str] = []
            for c_el in row_el:
                cell_type = c_el.attrib.get("t", "")
                val_str = ""
                for child in c_el:
                    if child.tag.endswith("}v") or child.tag == "v":
                        raw_v = child.text or ""
                        if cell_type == "s" and raw_v.isdigit():
                            idx = int(raw_v)
                            val_str = shared_strings[idx] if 0 <= idx < len(shared_strings) else raw_v
                        else:
                            val_str = raw_v
                    elif child.tag.endswith("}is") or child.tag == "is":
                        texts = [el.text or "" for el in child.iter() if el.tag.endswith("}t") or el.tag == "t"]
                        val_str = "".join(texts)
                row_vals.append(val_str.strip())
            if any(row_vals):
                rows.append(row_vals)
    return rows


def _read_csv_rows(text: str) -> List[List[str]]:
    reader = csv.reader(io.StringIO(text))
    return [[c.strip() for c in r] for r in reader if any(c.strip() for c in r)]


def _parse_tabular_rows(rows: List[List[str]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if not rows:
        return [], {"warnings": ["Uploaded spreadsheet contained no readable rows."]}

    headers = [h.lower() for h in rows[0]]
    col_map: Dict[str, int] = {}
    for idx, h in enumerate(headers):
        if any(k in h for k in ["product", "item", "name", "description", "particular"]):
            col_map.setdefault("name", idx)
        elif "sku" in h or "code" in h:
            col_map.setdefault("sku", idx)
        elif any(k in h for k in ["qty", "quantity", "units", "count"]):
            col_map.setdefault("quantity", idx)
        elif any(k in h for k in ["cost", "rate", "unit_price", "price"]):
            col_map.setdefault("unit_cost", idx)
        elif any(k in h for k in ["total", "amount"]):
            col_map.setdefault("line_total", idx)

    start_row = 1 if ("name" in col_map or "quantity" in col_map or "unit_cost" in col_map) else 0
    if start_row == 0 and len(rows[0]) >= 3:
        col_map = {"name": 0, "quantity": 1, "unit_cost": 2}

    items: List[Dict[str, Any]] = []
    for r in rows[start_row:]:
        if not r or not any(r):
            continue
        name = r[col_map["name"]] if "name" in col_map and col_map["name"] < len(r) else r[0]
        sku = r[col_map["sku"]] if "sku" in col_map and col_map["sku"] < len(r) else None
        if not name:
            continue

        def _num(key: str, default: float = 0.0) -> float:
            if key not in col_map or col_map[key] >= len(r):
                return default
            cleaned = re.sub(r"[^\d.\-]", "", r[col_map[key]] or "")
            try:
                return float(cleaned) if cleaned else default
            except ValueError:
                return default

        qty = _num("quantity", 1.0)
        unit_cost = _num("unit_cost", 0.0)
        line_total = _num("line_total", round(qty * unit_cost, 2))
        if unit_cost == 0.0 and line_total > 0 and qty > 0:
            unit_cost = round(line_total / qty, 2)
        items.append({
            "item_name": name,
            "sku": sku,
            "quantity": qty,
            "unit_cost": unit_cost,
            "line_total": round(line_total, 2),
        })
    return items, {"warnings": []}


def _extract_invoice_text_lines(text: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    headers: Dict[str, Any] = {}
    sup_m = re.search(r"(?i)(?:supplier|vendor|from|billed\s+by)\s*[:\-]\s*([^\n\r]+)", text)
    if sup_m:
        headers["supplier_name"] = sup_m.group(1).strip()
    inv_m = re.search(r"(?i)(?:invoice|bill|quote)\s*(?:no|number|#)?\s*[:\-]\s*([A-Za-z0-9\-_/]+)", text)
    if inv_m:
        headers["document_number"] = inv_m.group(1).strip()
    date_m = re.search(r"(?i)(?:date)\s*[:\-]\s*(\d{4}-\d{2}-\d{2}|\d{2}[/\-]\d{2}[/\-]\d{2,4})", text)
    if date_m:
        headers["document_date"] = date_m.group(1).strip()

    sub_m = re.search(r"(?i)sub[\s\-]?total\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)", text)
    tax_m = re.search(r"(?i)(?:gst|tax)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)", text)
    tot_m = re.search(r"(?im)^.*?(?:grand\s+total|total\s+amount|net\s+payable|total)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)", text)

    def _f(m):
        return float(m.group(1).replace(",", "")) if m else None

    if sub_m:
        headers["declared_subtotal"] = _f(sub_m)
    if tax_m:
        headers["declared_tax"] = _f(tax_m)
    if tot_m:
        headers["declared_total"] = _f(tot_m)

    items: List[Dict[str, Any]] = []
    # Match structured invoice lines: e.g. "Basmati Rice 1kg | qty: 10 | rate: 80 | total: 800" OR "1. Sugar 1kg  20  42.50  850.00"
    pipe_pattern = re.compile(r"^[\-\*\d\.\s]*([A-Za-z0-9][A-Za-z0-9\s\-\(\)/&]{2,60}?)\s*(?:\||,)\s*(?:qty\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*(?:[a-zA-Z]*)\s*(?:\||,)\s*(?:(?:rate|cost|price)\s*[:=]?\s*(?:rs\.?|₹)?\s*)?(\d+(?:\.\d+)?)(?:\s*(?:\||,)\s*(?:(?:total|amt)\s*[:=]?\s*(?:rs\.?|₹)?\s*)?(\d+(?:\.\d+)?))?", re.IGNORECASE)
    space_pattern = re.compile(r"^(?:\d+[\.\)]\s*)?([A-Za-z][A-Za-z0-9\s\-\(\)/&]{2,50}?)\s{2,}(\d+(?:\.\d+)?)\s+(?:rs\.?|₹)?(\d+(?:\.\d+)?)(?:\s+(?:rs\.?|₹)?(\d+(?:\.\d+)?))?$", re.IGNORECASE)

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or any(line.lower().startswith(h) for h in ("supplier", "vendor", "invoice", "date:", "total", "grand total", "subtotal", "gst", "tax", "---")):
            continue
        m = pipe_pattern.match(line) or space_pattern.match(line)
        if m:
            name = m.group(1).strip(" -|:")
            qty = float(m.group(2))
            cost = float(m.group(3))
            ltot = float(m.group(4)) if m.group(4) else round(qty * cost, 2)
            items.append({
                "item_name": name,
                "sku": None,
                "quantity": qty,
                "unit_cost": cost,
                "line_total": round(ltot, 2),
            })

    return headers, items


def _optional_vision_image_extract(raw_bytes: bytes, mime_type: str) -> Optional[str]:
    """Uses configured external multimodal Vision LLM if API key is provided; returns None otherwise."""
    prompt = (
        "Extract supplier name, invoice/receipt date, line items (name, qty, unit price, total), "
        "tax and grand total cleanly from this retail image. Use pipe format per item: Item Name | qty | unit_cost | line_total."
    )
    try:
        b64 = base64.b64encode(raw_bytes).decode("ascii")
        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip():
            base = settings.OPENAI_BASE_URL.rstrip("/")
            resp = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY.strip()}"},
                json={
                    "model": settings.OPENAI_FAST_MODEL,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                        ],
                    }],
                },
                timeout=15.0,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip():
            from google import genai  # type: ignore

            client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
            model = getattr(settings, "GEMINI_FAST_MODEL", None) or settings.GEMINI_MODEL or "gemini-3.8-flash"
            interaction = client.interactions.create(
                model=model,
                input=[
                    {"type": "text", "text": prompt},
                    {"type": "image", "data": b64, "mime_type": mime_type},
                ],
                generation_config={"thinking_level": "minimal"},
                stream=False,
            )
            text = (getattr(interaction, "output_text", None) or "").strip()
            if text:
                return text
    except Exception:
        return None
    return None


def extract_and_match_document(
    db: Session,
    *,
    business_id: int,
    filename: str,
    content_type: str,
    raw_bytes: bytes,
    document_type: str = "PURCHASE_INVOICE",
) -> Tuple[str, str, Dict[str, Any]]:
    """
    Parses CSV, XLSX, JSON, TXT, PDF text layer, or Image files cleanly.
    Matches extracted SKUs/products & suppliers against active tenant catalog.
    Returns (extraction_status, raw_excerpt, extracted_dict).
    """
    lower_name = (filename or "").lower()
    headers: Dict[str, Any] = {}
    items: List[Dict[str, Any]] = []
    warnings: List[str] = []
    raw_excerpt = ""

    if lower_name.endswith(".csv") or "csv" in (content_type or "").lower():
        text = raw_bytes.decode("utf-8", errors="replace")
        raw_excerpt = text[:1500]
        items, meta = _parse_tabular_rows(_read_csv_rows(text))
        warnings.extend(meta.get("warnings", []))

    elif lower_name.endswith(".xlsx"):
        try:
            rows = _read_xlsx_rows(raw_bytes)
            raw_excerpt = "\n".join(" | ".join(r) for r in rows[:15])
            items, meta = _parse_tabular_rows(rows)
            warnings.extend(meta.get("warnings", []))
        except Exception as exc:
            warnings.append(f"XLSX parse error: {exc}")

    elif lower_name.endswith((".png", ".jpg", ".jpeg", ".webp")) or (content_type or "").startswith("image/"):
        if Image is None:
            return "FAILED", "Pillow (PIL) is not installed for image processing.", {"warnings": ["Pillow not installed"], "line_items": []}
        try:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                w, h = img.size
                fmt = img.format
            headers["image_dimensions"] = f"{w}x{h} ({fmt})"
            vision_text = _optional_vision_image_extract(raw_bytes, content_type or "image/png")
            if vision_text:
                raw_excerpt = vision_text[:1500]
                headers, items = _extract_invoice_text_lines(vision_text)
                headers["image_dimensions"] = f"{w}x{h} ({fmt})"
            else:
                raw_excerpt = f"Validated image {filename} ({w}x{h} {fmt})."
                warnings.append(
                    "Visual OCR/VLM provider key (OPENAI_API_KEY or GEMINI_API_KEY) is not configured — "
                    "image dimensions verified safely without fabricating unverified text. Upload CSV/XLSX/TXT or enable an API key for automated OCR."
                )
        except Exception as exc:
            return "FAILED", f"Invalid image file: {exc}", {"warnings": [str(exc)], "line_items": []}

    elif lower_name.endswith(".json") or "json" in (content_type or "").lower():
        text = raw_bytes.decode("utf-8", errors="replace")
        raw_excerpt = text[:1500]
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                headers["supplier_name"] = obj.get("supplier_name")
                headers["document_number"] = obj.get("invoice_number") or obj.get("document_number")
                headers["declared_total"] = obj.get("total_amount")
                raw_items = obj.get("items") or obj.get("line_items") or []
            elif isinstance(obj, list):
                raw_items = obj
            else:
                raw_items = []
            for r in raw_items:
                items.append({
                    "item_name": str(r.get("item_name") or r.get("name") or r.get("product_name") or ""),
                    "sku": r.get("sku"),
                    "quantity": float(r.get("quantity", 1.0)),
                    "unit_cost": float(r.get("unit_cost") or r.get("cost") or 0.0),
                    "line_total": float(r.get("line_total") or (float(r.get("quantity", 1.0)) * float(r.get("unit_cost") or 0.0))),
                })
        except Exception as exc:
            warnings.append(f"JSON parse warning: {exc}")

    else:
        # TXT / PDF text extraction fallback
        text = raw_bytes.decode("utf-8", errors="replace")
        if "%PDF-" in text[:64]:
            # Extract ASCII/UTF printable parenthesized strings inside PDF streams cleanly
            chunks = re.findall(r"\(([^()]{3,120})\)", text)
            text = "\n".join(c for c in chunks if re.search(r"[A-Za-z0-9]", c)) or text
        raw_excerpt = text[:1500]
        headers, items = _extract_invoice_text_lines(text)

    # Match extracted items & supplier against live tenant DB
    products = db.query(Product).filter(Product.business_id == business_id, Product.is_archived == False).all()
    suppliers = db.query(Supplier).filter(Supplier.business_id == business_id).all()

    matched_supplier_id = None
    matched_supplier_name = None
    if headers.get("supplier_name"):
        s_q = headers["supplier_name"].lower()
        for s in suppliers:
            if s.name.lower() in s_q or s_q in s.name.lower():
                matched_supplier_id = s.id
                matched_supplier_name = s.name
                break

    matched_count = 0
    computed_subtotal = 0.0
    enriched_items: List[Dict[str, Any]] = []
    for it in items:
        iname = (it.get("item_name") or "").strip()
        isku = (it.get("sku") or "").strip().lower()
        best_prod: Optional[Product] = None
        for p in products:
            if isku and p.sku and p.sku.lower() == isku:
                best_prod = p
                break
            if iname and (p.name.lower() == iname.lower() or p.name.lower() in iname.lower() or iname.lower() in p.name.lower()):
                best_prod = p
                break
        qty = float(it.get("quantity") or 0.0)
        ucost = float(it.get("unit_cost") or 0.0)
        ltot = round(float(it.get("line_total") or (qty * ucost)), 2)
        computed_subtotal += ltot

        cost_delta = None
        if best_prod:
            matched_count += 1
            if best_prod.purchase_cost > 0 and ucost > 0:
                cost_delta = round(((ucost - best_prod.purchase_cost) / best_prod.purchase_cost) * 100.0, 1)

        enriched_items.append({
            "item_name": iname,
            "sku": it.get("sku"),
            "quantity": qty,
            "unit_cost": ucost,
            "line_total": ltot,
            "matched_product_id": best_prod.id if best_prod else None,
            "matched_product_name": best_prod.name if best_prod else None,
            "current_catalog_cost": best_prod.purchase_cost if best_prod else None,
            "cost_change_percent": cost_delta,
        })

    # Math check vs declared total
    math_check: Dict[str, Any] = {"computed_subtotal": round(computed_subtotal, 2)}
    if headers.get("declared_total") is not None:
        declared_sub = headers.get("declared_subtotal") or (headers["declared_total"] - (headers.get("declared_tax") or 0.0))
        diff = round(abs(computed_subtotal - float(declared_sub)), 2)
        math_check["declared_total"] = headers["declared_total"]
        math_check["discrepancy"] = diff
        math_check["math_verified"] = diff <= 1.0
        if diff > 1.0:
            warnings.append(f"Subtotal discrepancy detected: line sum ₹{computed_subtotal:,.2f} vs declared ₹{declared_sub:,.2f} (diff ₹{diff:,.2f}).")

    extraction_status = "PROCESSED" if enriched_items and not warnings else ("NEEDS_REVIEW" if (enriched_items or warnings) else "NEEDS_REVIEW")
    return (
        extraction_status,
        raw_excerpt,
        {
            "document_type": document_type,
            "headers": headers,
            "matched_supplier_id": matched_supplier_id,
            "matched_supplier_name": matched_supplier_name,
            "items_count": len(enriched_items),
            "matched_items_count": matched_count,
            "unmatched_items_count": len(enriched_items) - matched_count,
            "line_items": enriched_items,
            "math_check": math_check,
            "warnings": warnings,
        },
    )
