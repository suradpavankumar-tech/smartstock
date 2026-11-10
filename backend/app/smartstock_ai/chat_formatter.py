import math
import re
from typing import Any, Dict, List, Optional, Tuple


def _try_solve_retail_math(text: str, lang: str) -> Optional[str]:
    """Handles quick margin, GST, markup, and safe arithmetic questions naturally like ChatGPT."""
    low = (text or "").lower()

    # Pattern 1: Cost & Sell price margin calculation
    # e.g., "cost 80 sell 100 margin", "bought for 50 sold at 65", "50 ರೂಪಾಯಿಗೆ ತಗೊಂಡು 65ಕ್ಕೆ ಮಾರಿದರೆ"
    m_cs = re.search(
        r"(?:cost|buy|bought|purchase|ತಗೊಂಡು|ಕೊಂಡು|ಖರೀದಿ|खरीद)[^\d]{0,20}(\d+(?:\.\d+)?)"
        r".*?(?:sell|selling|sold|price|ಮಾರಿ|ಮಾರಾಟ|बेच)[^\d]{0,20}(\d+(?:\.\d+)?)",
        low,
    )
    if m_cs:
        cost = float(m_cs.group(1))
        sell = float(m_cs.group(2))
        if cost > 0 and sell > 0:
            profit = sell - cost
            margin_pct = (profit / sell) * 100.0
            markup_pct = (profit / cost) * 100.0
            if lang == "kn":
                return (
                    f"ಖರೀದಿ ಬೆಲೆ **₹{cost:,.2f}** ಮತ್ತು ಮಾರಾಟ ಬೆಲೆ **₹{sell:,.2f}** ಆದರೆ:\n\n"
                    f"- **ಪ್ರತಿ ಯೂನಿಟ್ ಲಾಭ:** **₹{profit:,.2f}**\n"
                    f"- **ಮಾರಾಟ ಮಾರ್ಜಿನ್ (Gross Margin):** **{margin_pct:.1f}%**\n"
                    f"- **ಮಾರ್ಕ್‌ಅಪ್ (Markup on Cost):** **{markup_pct:.1f}%**"
                )
            if lang == "hi":
                return (
                    f"खरीद मूल्य **₹{cost:,.2f}** और बिक्री मूल्य **₹{sell:,.2f}** पर:\n\n"
                    f"- **शुद्ध मुनाफा:** **₹{profit:,.2f}**\n"
                    f"- **ग्रॉस मार्जिन (Margin %):** **{margin_pct:.1f}%**\n"
                    f"- **मार्कअप (Cost पर):** **{markup_pct:.1f}%**"
                )
            return (
                f"With a cost of **₹{cost:,.2f}** and selling price of **₹{sell:,.2f}**:\n\n"
                f"- **Profit per unit:** **₹{profit:,.2f}**\n"
                f"- **Gross Margin:** **{margin_pct:.1f}%** *(profit ÷ selling price)*\n"
                f"- **Markup on Cost:** **{markup_pct:.1f}%** *(profit ÷ cost)*"
            )

    # Pattern 2: X% GST or X% of Y
    m_pct = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:gst|tax|discount|margin|of|on|ರ|ಕಡಿಮೆ|का|पर)?\s*(?:of|on|for|ಕ್ಕೆ|ರ|का|पर)?\s*(\d+(?:\.\d+)?)", low)
    if m_pct:
        pct = float(m_pct.group(1))
        base = float(m_pct.group(2))
        part = base * (pct / 100.0)
        added = base + part
        minus = base - part
        if "gst" in low or "tax" in low or "ಜಿಎಸ್" in low or "ತೆರಿಗೆ" in low:
            if lang == "kn":
                return (
                    f"**₹{base:,.2f}** ಮೇಲೆ **{pct:g}% GST** ಲೆಕ್ಕಾಚಾರ:\n\n"
                    f"- **ತೆರಿಗೆ ಮೊತ್ತ ({pct:g}%):** **₹{part:,.2f}** (CGST ₹{part/2:,.2f} + SGST ₹{part/2:,.2f})\n"
                    f"- **ಒಟ್ಟು ಬಿಲ್ ಮೊತ್ತ:** **₹{added:,.2f}**"
                )
            if lang == "hi":
                return (
                    f"**₹{base:,.2f}** पर **{pct:g}% GST**:\n\n"
                    f"- **GST राशि:** **₹{part:,.2f}** (CGST ₹{part/2:,.2f} + SGST ₹{part/2:,.2f})\n"
                    f"- **कुल बिल राशि:** **₹{added:,.2f}**"
                )
            return (
                f"For **{pct:g}% GST** on **₹{base:,.2f}**:\n\n"
                f"- **GST Amount:** **₹{part:,.2f}** (CGST ₹{part/2:,.2f} + SGST ₹{part/2:,.2f})\n"
                f"- **Total with GST:** **₹{added:,.2f}**"
            )
        else:
            if lang == "kn":
                return f"**₹{base:,.2f}** ರ **{pct:g}%** = **₹{part:,.2f}** (ಸೇರಿಸಿದರೆ **₹{added:,.2f}** · ಕಳೆದರೆ **₹{minus:,.2f}**)."
            if lang == "hi":
                return f"**₹{base:,.2f}** का **{pct:g}%** = **₹{part:,.2f}** (जोड़ने पर **₹{added:,.2f}** · घटाने पर **₹{minus:,.2f}**)."
            return f"**{pct:g}%** of **{base:,.2f}** is **{part:,.2f}** (+{pct:g}% = **{added:,.2f}**, −{pct:g}% = **{minus:,.2f}**)."

    # Pattern 3: Pure simple arithmetic expression like "250 * 12" or "1500 / 24"
    expr_m = re.match(r"^(?:calculate|calc|what is|eshtu|kitna|=)?\s*([\d\s.+\-*/()]+)\??$", low.strip())
    if expr_m:
        raw_expr = expr_m.group(1).strip()
        if any(op in raw_expr for op in ("+", "-", "*", "/")) and len(raw_expr) <= 40:
            try:
                val = eval(raw_expr, {"__builtins__": {}}, {})  # validated digits + arithmetic ops only
                if isinstance(val, (int, float)) and not math.isnan(val) and not math.isinf(val):
                    formatted = f"{val:,.2f}" if isinstance(val, float) and not val.is_integer() else f"{int(val):,}"
                    if lang == "kn":
                        return f"`{raw_expr}` = **{formatted}**"
                    if lang == "hi":
                        return f"`{raw_expr}` = **{formatted}**"
                    return f"`{raw_expr}` = **{formatted}**"
            except Exception:
                pass
    return None


def build_general_gpt_reply(
    *,
    query: str,
    normalized_query: str,
    lang: str,
    mode: str,
    shop_name: str,
    owner_name: str,
) -> Tuple[str, List[str]]:
    """
    Produces natural ChatGPT-style conversational answers for general retail advice,
    concepts, message writing, language checks, and math — without forcing unrelated DB dumps.
    """
    low = (query or "").lower()
    norm_low = (normalized_query or "").lower()

    # 1. Retail math / margin / GST quick calculator
    math_ans = _try_solve_retail_math(query, lang)
    if math_ans:
        if lang == "kn":
            return math_ans, ["ಈ ತಿಂಗಳ ನಿಜವಾದ ಲಾಭ ತೋರಿಸಿ", "ಅತಿ ಹೆಚ್ಚು ಮಾರ್ಜಿನ್ ಇರುವ ವಸ್ತುಗಳು ಯಾವುವು?"]
        if lang == "hi":
            return math_ans, ["इस महीने का असली मुनाफा बताओ", "सबसे ज़्यादा मार्जिन वाले प्रोडक्ट्स दिखाओ"]
        return math_ans, ["Check my actual profit this month", "Which products in my store have top margins?"]

    # 2. Language capability inquiry ("can you speak Kannada?", "ನೀವು ಕನ್ನಡದಲ್ಲಿ ಮಾತಾಡ್ತೀರಾ?")
    if any(
        k in low
        for k in [
            "speak kannada", "know kannada", "understand kannada", "talk in kannada",
            "reply in kannada", "can you kannada", "speak hindi", "know hindi",
            "understand hindi", "ಕನ್ನಡ ಬರುತ್ತಾ", "ಕನ್ನಡದಲ್ಲಿ ಮಾತಾಡ", "ಕನ್ನಡ ಅರ್ಥ",
            "हिंदी आती है",
        ]
    ):
        if lang == "kn":
            return (
                f"ಹೌದು {owner_name}, ಖಂಡಿತ! ನಾನು ಸಂಪೂರ್ಣವಾಗಿ ಕನ್ನಡದಲ್ಲಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತೇನೆ ಮತ್ತು ಕನ್ನಡದಲ್ಲೇ ಉತ್ತರಿಸುತ್ತೇನೆ.\n\n"
                f"**{shop_name}** ಅಂಗಡಿಯ ಲಾಭ, ದಿನದ ಮಾರಾಟ, ಕಡಿಮೆ ಸ್ಟಾಕ್, ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ ಅಥವಾ ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್ — ಏನೇ ಇದ್ದರೂ ನೇರವಾಗಿ ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ.",
                ["ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಇರುವ ಸರಕುಗಳು ಯಾವುವು?", "ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ ತೋರಿಸಿ"],
            )
        if lang == "hi":
            return (
                f"जी हाँ {owner_name}, बिल्कुल! मैं हिन्दी और इंग्लिश दोनों अच्छी तरह समझता हूँ।\n\n"
                f"आप **{shop_name}** के मुनाफे, बिक्री, कम स्टॉक, खाता बकाया या ऑर्डर ड्राफ्ट के बारे में कुछ भी पूछ सकते हैं।",
                ["इस महीने का मुनाफा बताओ", "कम स्टॉक वाले सामान दिखाओ"],
            )
        return (
            f"Yes {owner_name}, I understand and reply fluently in **English**, **ಕನ್ನಡ (Kannada)**, and **हिन्दी (Hindi)**.\n\n"
            f"Just write naturally — even mixing languages — and I'll respond in your language.",
            ["ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "How much profit did I make this month?"],
        )

    # 3. WhatsApp / customer message drafting (Diwali, festivals, Khata reminders, promotions)
    if any(k in norm_low for k in ["whatsapp message", "whatsapp greeting", "write a message", "draft a message", "diwali", "deepavali", "festival", "ugadi", "pongal", "dasara", "eid", "ಸಂದೇಶ ಬರೆಯಿರಿ", "ಶುಭಾಶಯ", "ಮಸೇಜ್"]):
        is_diwali = any(k in norm_low or k in low for k in ["diwali", "deepavali", "ದೀಪಾವಳಿ", "दिवाली"])
        if is_diwali:
            if lang == "kn":
                msg = (
                    f"ಖಂಡಿತ! ನಿಮ್ಮ ಗ್ರಾಹಕರಿಗೆ ಕಳುಹಿಸಲು ದೀಪಾವಳಿ ಹಬ್ಬದ ಶುಭಾಶಯ ಸಂದೇಶ ಇಲ್ಲಿದೆ:\n\n"
                    f"> ಹ್ಯಾಪಿ ದೀಪಾವಳಿ! ಈ ಬೆಳಕಿನ ಹಬ್ಬವು ನಿಮಗೂ ಮತ್ತು ನಿಮ್ಮ ಕುಟುಂಬಕ್ಕೂ ಸುಖ, ಶಾಂತಿ ಮತ್ತು ಸಮೃದ್ಧಿಯನ್ನು ತರಲಿ ಎಂದು ಹಾರೈಸುತ್ತೇವೆ. **{shop_name}** ಮೇಲಿನ ನಿಮ್ಮ ನಂಬಿಕೆಗೆ ಹೃದಯಪೂರ್ವಕ ಧನ್ಯವಾದಗಳು — ಹಬ್ಬದ ಖರೀದಿಗಾಗಿ ಇಂದೇ ಭೇಟಿ ನೀಡಿ!"
                )
                return msg, ["ಖಾತಾ ಬಾಕಿ ಇರುವ ಗ್ರಾಹಕರನ್ನು ತೋರಿಸಿ", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಪರಿಶೀಲಿಸಿ"]
            if lang == "hi":
                msg = (
                    f"आपके ग्राहकों के लिए विनम्र दिवाली शुभकामना WhatsApp संदेश तैयार है:\n\n"
                    f"> शुभ दिवाली! आपको और आपके परिवार को रोशनी के इस पावन पर्व की हार्दिक शुभकामनाएँ। **{shop_name}** पर आपके भरोसे के लिए धन्यवाद!"
                )
                return msg, ["ग्राहकों का खाता बकाया दिखाओ", "इस महीने का मुनाफा बताओ"]
            msg = (
                f"Here's a short, polite Diwali WhatsApp greeting you can share with **{shop_name}** customers:\n\n"
                f"> Happy Diwali! Warm festive wishes to you and your family for joy, health, and prosperity. Thank you for shopping with **{shop_name}** — we look forward to serving you this festive season!\n\n"
                f"Let me know if you'd like to include any festive discount or translate it into Kannada."
            )
            return msg, ["Which slow-moving items should I put on offer?", "Show customers with pending Khata"]

        if lang == "kn":
            msg = (
                f"ಖಂಡಿತ! ನಿಮ್ಮ ಗ್ರಾಹಕರಿಗೆ ಕಳುಹಿಸಲು ಸಿದ್ಧವಾಗಿರುವ ವಾಟ್ಸಾಪ್ ಸಂದೇಶ ಇಲ್ಲಿದೆ:\n\n"
                f"> ನಮಸ್ಕಾರ! ನಿಮ್ಮ ನೆಚ್ಚಿನ **{shop_name}** ನಲ್ಲಿ ಈಗ ಹೊಸ ಸ್ಟಾಕ್ ಮತ್ತು ವಿಶೇಷ ರಿಯಾಯಿತಿಗಳು ಲಭ್ಯವಿವೆ. "
                f"ದಿನಸಿ ಹಾಗೂ ಅಗತ್ಯ ವಸ್ತುಗಳ ಮೇಲೆ ವಿಶೇಷ ದರ ಪಡೆಯಲು ಇಂದೇ ಅಂಗಡಿಗೆ ಭೇಟಿ ನೀಡಿ ಅಥವಾ ನಮಗೆ ಆರ್ಡರ್ ಕಳುಹಿಸಿ. ಧನ್ಯವಾದಗಳು!\n\n"
                f"ಬೇರೆ ಯಾವುದೇ ಹಬ್ಬದ ಆಫರ್ ಅಥವಾ ಖಾತಾ ನೆನಪಿನ ಸಂದೇಶ ಬೇಕಿದ್ದರೆ ತಿಳಿಸಿ."
            )
            return msg, ["ಖಾತಾ ಬಾಕಿ ಇರುವ ಗ್ರಾಹಕರನ್ನು ತೋರಿಸಿ", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಪರಿಶೀಲಿಸಿ"]
        if lang == "hi":
            msg = (
                f"यह रहा आपके ग्राहकों के लिए तैयार WhatsApp संदेश:\n\n"
                f"> नमस्ते! आपकी अपनी दुकान **{shop_name}** पर ताज़ा स्टॉक और खास ऑफर आ गए हैं। "
                f"आज ही आइए या यहीं मैसेज भेजकर घर बैठे ऑर्डर बुक करें। धन्यवाद!\n\n"
                f"अगर किसी खास त्योहार या बकाया रिमाइंडर का मैसेज चाहिए तो बताइए।"
            )
            return msg, ["ग्राहकों का खाता बकाया दिखाओ", "इस महीने का मुनाफा बताओ"]
        msg = (
            f"Here's a ready-to-send WhatsApp message for **{shop_name}** customers:\n\n"
            f"> Hello! Fresh stock and weekend value offers are now live at **{shop_name}**. "
            f"Drop by today or reply with your list for quick pickup/delivery. Thank you for shopping with us!\n\n"
            f"Tell me the occasion, product, or discount and I can customize it further."
        )
        return msg, ["Which slow-moving items should I put on offer?", "Show customers with pending Khata"]

    # 4. Customer growth / increasing sales advice
    if any(k in norm_low for k in ["get more customer", "increase customer", "attract customer", "attract more customer", "bring more customer", "grow sales", "increase sales", "boost sales", "ಗ್ರಾಹಕರನ್ನು ಹೆಚ್ಚಿಸ", "ಗ್ರಾಹಕರನ್ನು ಆಕರ್ಷಿಸ", "ವ್ಯಾಪಾರ ಬೆಳೆಸ", "ಮಾರಾಟ ಹೆಚ್ಚಿಸ", "बिक्री बढ़ा", "ग्राहक बढ़ा"]) or re.search(
        r"(?:more|increase|grow|boost|attract|bring|ಹೆಚ್ಚಿಸ|ಬೆಳೆಸ|ಆಕರ್ಷಿಸ|आकर्षित|बढ़ा).{0,25}(?:customer|sales|footfall|ಗ್ರಾಹಕ|ಮಾರಾಟ|ವ್ಯಾಪಾರ|ग्राहक|बिक्री)",
        norm_low,
    ):
        if lang == "kn":
            reply = (
                f"**{shop_name}** ಅಂಗಡಿಯಲ್ಲಿ ಗ್ರಾಹಕರನ್ನು ಮತ್ತು ದೈನಂದಿನ ಮಾರಾಟವನ್ನು ಹೆಚ್ಚಿಸಲು 5 ಪ್ರಾಯೋಗಿಕ ಮಾರ್ಗಗಳು:\n\n"
                "1. **ಅಗತ್ಯ ವಸ್ತುಗಳ ಸ್ಟಾಕ್ ಖಾಲಿಯಾಗದಂತೆ ನೋಡಿಕೊಳ್ಳಿ:** ಹಾಲು, ಅಕ್ಕಿ, ಎಣ್ಣೆ, ಬೇಳೆ ಮುಂತಾದ ದಿನನಿತ್ಯದ ವಸ್ತುಗಳು ಸದಾ ಲಭ್ಯವಿದ್ದರೆ ಗ್ರಾಹಕರು ಬೇರೆ ಅಂಗಡಿಗೆ ಹೋಗುವುದಿಲ್ಲ.\n"
                "2. **ಹೆಚ್ಚು ಮಾರ್ಜಿನ್ ವಸ್ತುಗಳನ್ನು ಕೌಂಟರ್ ಹತ್ತಿರ ಇಡಿ:** ಬಿಸ್ಕೆಟ್, ಸ್ನ್ಯಾಕ್ಸ್, ಸಣ್ಣ ಪ್ಯಾಕ್‌ಗಳನ್ನು POS ಬಿಲ್ಲಿಂಗ್ ಹತ್ತಿರ ಇಡುವುದರಿಂದ ಪ್ರತಿ ಬಿಲ್ ಮೌಲ್ಯ ಹೆಚ್ಚಾಗುತ್ತದೆ.\n"
                "3. **ವಾಟ್ಸಾಪ್ ಆರ್ಡರ್ ಮತ್ತು ಬಿಲ್ ಸೇವೆ:** ನಿಯಮಿತ ಗ್ರಾಹಕರಿಗೆ ವಾಟ್ಸಾಪ್ ಮೂಲಕ ಆರ್ಡರ್ ತೆಗೆದುಕೊಂಡು ವೇಗದ ಡೆಲಿವರಿ ನೀಡಿ.\n"
                "4. **ನಿಧಾನವಾಗಿ ಮಾರಾಟವಾಗುವ ಸರಕುಗಳಿಗೆ ಕಾಂಬೊ ಆಫರ್:** ಹೆಚ್ಚು ದಿನ ಉಳಿದಿರುವ ವಸ್ತುಗಳನ್ನು ಜನಪ್ರಿಯ ಸರಕುಗಳ ಜೊತೆ ಸಣ್ಣ ರಿಯಾಯಿತಿಯಲ್ಲಿ ನೀಡಿ.\n"
                "5. **ಶಿಸ್ತುಬದ್ಧ ಖಾತಾ ಮತ್ತು UPI ಪಾವತಿ:** ಸ್ಪಷ್ಟ UPI QR ಕೋಡ್ ಮತ್ತು ಸಮಯಕ್ಕೆ ಸರಿಯಾದ ವಾಟ್ಸಾಪ್ ಖಾತಾ ಜ್ಞಾಪನೆಗಳು ವಿಶ್ವಾಸ ಮತ್ತು ಮರು-ಭೇಟಿ ಹೆಚ್ಚಿಸುತ್ತವೆ."
            )
            if mode == "DEEP_ANALYSIS":
                reply += "\n\n*Deep Mode ಸಲಹೆ:* ನಿಮ್ಮ ಅಂಗಡಿಯ ನಿಜವಾದ ಟಾಪ್-ಮಾರ್ಜಿನ್ ಹಾಗೂ ನಿಧಾನ ಸ್ಟಾಕ್ ವಸ್ತುಗಳನ್ನು ನೋಡಲು **\"working capital ಮತ್ತು margin ತೋರಿಸಿ\"** ಎಂದು ಕೇಳಿ."
            return reply, ["ಈಗ ಅತಿ ಹೆಚ್ಚು ಮಾರ್ಜಿನ್ ಇರುವ ವಸ್ತುಗಳು ಯಾವುವು?", "ಹಳೆಯ ನಿಧಾನ ಸ್ಟಾಕ್ ತೋರಿಸಿ"]
        if lang == "hi":
            reply = (
                f"**{shop_name}** में ग्राहक और बिक्री बढ़ाने के 5 असरदार तरीके:\n\n"
                "1. **रोज़मर्रा के सामान कभी खत्म न होने दें:** दूध, तेल, दाल, आटा जैसे ज़रूरी सामान हमेशा उपलब्ध रहने से ग्राहक पक्के बनते हैं।\n"
                "2. **काउंटर के पास हाई-मार्जिन सामान रखें:** बिस्कुट, स्नैक्स और छोटे पैक बिलिंग काउंटर के पास रखने से औसत बिल बढ़ता है।\n"
                "3. **WhatsApp ऑर्डर और डिजिटल बिल:** नियमित ग्राहकों को WhatsApp पर लिस्ट भेजकर ऑर्डर लेने की सुविधा दें।\n"
                "4. **धीमे बिकने वाले माल पर कॉम्बो ऑफर:** 60–90 दिन से पड़े स्टॉक को तेज़ बिकने वाले आइटम के साथ बंडल करें।\n"
                "5. **स्पष्ट खाता और तेज़ UPI चेकआउट:** समय पर विनम्र खाता रिमाइंडर से नकदी और भरोसा दोनों बढ़ते हैं।"
            )
            return reply, ["कौन से प्रोडक्ट्स सबसे ज़्यादा मुनाफा देते हैं?", "धीमे बिकने वाला स्टॉक दिखाओ"]
        reply = (
            f"Here are 5 practical ways to bring more repeat customers to **{shop_name}**:\n\n"
            "1. **Keep daily staples in stock:** Milk, rice, cooking oil, and pulses drive footfall — stocking out sends regulars to competitors.\n"
            "2. **Counter impulse bundles:** Place high-margin snacks, tea sachets, or chocolates near checkout to lift average bill value.\n"
            "3. **WhatsApp list ordering:** Let nearby families WhatsApp grocery lists for 30-minute pickup or local delivery.\n"
            "4. **Weekend combo offers on slow stock:** Pair slower inventory with fast movers rather than waiting 90+ days.\n"
            "5. **Smooth Khata + UPI reminders:** Friendly WhatsApp payment reminders build trust while keeping working capital moving."
        )
        return reply, ["Which products in my store give the highest margin?", "Check any slow or dead stock right now"]

    # 5. Concept explanations (Gross Margin, Working Capital, FEFO/FIFO, GST Composition, Expiry)
    if any(k in norm_low for k in ["gross margin", "working capital", "fefo", "fifo", "composition scheme", "what is gst", "reduce expiry", "ಮಾರ್ಜಿನ್ ಅಂದರೆ", "ದುಡಿಯುವ ಬಂಡವಾಳ ಅಂದರೆ", "ಅವಧಿ ಮುಗಿಯುವ ನಷ್ಟ", "ಜಿಎಸ್‌ಟಿ ಅಂದರೆ"]):
        if lang == "kn":
            if "expiry" in norm_low or "ಅವಧಿ" in norm_low:
                return (
                    "ಅಂಗಡಿಯಲ್ಲಿ ಎಕ್ಸ್‌ಪೈರಿ ನಷ್ಟ ಕಡಿಮೆ ಮಾಡಲು 4 ಸುಲಭ ನಿಯಮಗಳು:\n\n"
                    "1. **FEFO (First Expired, First Out):** ಮೊದಲು ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್ ಅನ್ನು ಶೆಲ್ಫ್‌ನ ಮುಂಭಾಗದಲ್ಲಿ ಇಡಿ.\n"
                    "2. **ಚಿಕ್ಕ ಬ್ಯಾಚ್‌ಗಳಲ್ಲಿ ಖರೀದಿ:** ಹಾಲು, ಬ್ರೆಡ್, ಮಸಾಲೆ ವಸ್ತುಗಳನ್ನು ದೊಡ್ಡ ಪ್ರಮಾಣದ ಬದಲು ವಾರದ ಬೇಡಿಕೆಯಂತೆ ತರಿಸಿ.\n"
                    "3. **15–30 ದಿನ ಮುಂಚಿತ ರಿಯಾಯಿತಿ:** ಅವಧಿ ಹತ್ತಿರ ಇರುವ ವಸ್ತುಗಳಿಗೆ 10–15% ಆಫರ್ ಅಥವಾ ಕಾಂಬೊ ನೀಡಿ.\n"
                    "4. **ನಿಯಮಿತ ಬ್ಯಾಚ್ ಪರಿಶೀಲನೆ:** ನನಗೆ *\"ಮುಗಿಯುವ ಬ್ಯಾಚ್‌ಗಳು ಯಾವುವು?\"* ಎಂದು ಕೇಳಿದರೆ ನಾನು ತಕ್ಷಣ ಪಟ್ಟಿ ಕೊಡುತ್ತೇನೆ.",
                    ["30 ದಿನದಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್‌ಗಳು ಯಾವುವು?", "ಹಳೆಯ ನಿಧಾನ ಸ್ಟಾಕ್ ತೋರಿಸಿ"],
                )
            return (
                "ಚಿಲ್ಲರೆ ವ್ಯಾಪಾರದ ಮುಖ್ಯ ಲೆಕ್ಕಪತ್ರ ಪದಗಳ ಸರಳ ವಿವರಣೆ:\n\n"
                "- **Gross Margin (%):** `(ಮಾರಾಟ ಬೆಲೆ - ಖರೀದಿ ಬೆಲೆ) ÷ ಮಾರಾಟ ಬೆಲೆ × 100`. ಉದಾಹರಣೆಗೆ ₹80ಕ್ಕೆ ಕೊಂಡು ₹100ಕ್ಕೆ ಮಾರಿದರೆ 20% ಮಾರ್ಜಿನ್.\n"
                "- **Net / Operating Profit:** ಒಟ್ಟು ಲಾಭದಿಂದ ಬಾಡಿಗೆ, ವಿದ್ಯುತ್, ಸಂಬಳದಂತಹ ಅಂಗಡಿ ವೆಚ್ಚಗಳನ್ನು ಕಳೆದ ನಂತರ ಉಳಿಯುವ ನಿಜವಾದ ಲಾಭ.\n"
                "- **Working Capital (ದುಡಿಯುವ ಬಂಡವಾಳ):** ಅಂಗಡಿಯ ಶೆಲ್ಫ್‌ಗಳಲ್ಲಿ ನಿಂತಿರುವ ಸ್ಟಾಕ್ ಮೌಲ್ಯ + ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ ಮೊತ್ತ.\n"
                "- **FEFO:** ಮೊದಲು ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್ ಅನ್ನು ಮೊದಲು ಮಾರುವುದು (ಹಾಲು, ಔಷಧಿ ಮತ್ತು ಆಹಾರ ಪದಾರ್ಥಗಳಿಗೆ ಉತ್ತಮ).",
                ["ನನ್ನ ಅಂಗಡಿಯ ನಿಜವಾದ ಮಾರ್ಜಿನ್ ಮತ್ತು ಲಾಭ ತೋರಿಸಿ", "ನನ್ನ ದುಡಿಯುವ ಬಂಡವಾಳ ಎಷ್ಟಿದೆ?"],
            )
        if lang == "hi":
            return (
                "खुदरा व्यापार के प्रमुख शब्दों का आसान मतलब:\n\n"
                "- **Gross Margin (%):** `(बिक्री मूल्य - खरीद लागत) ÷ बिक्री मूल्य × 100`। जैसे ₹80 का सामान ₹100 में बिके तो 20% मार्जिन।\n"
                "- **Operating Profit:** कुल मुनाफे में से किराया, बिजली और स्टाफ खर्च घटाने के बाद की असली बचत।\n"
                "- **Working Capital:** दुकान के स्टॉक में लगा पैसा + ग्राहकों का बकाया खाता।\n"
                "- **FEFO:** जो बैच पहले एक्सपायर होने वाला है, उसे पहले बेचना।",
                ["मेरे स्टोर का असली मुनाफा और मार्जिन दिखाओ", "कितना पैसा स्टॉक और खाते में फँसा है?"],
            )
        return (
            "Here's a quick breakdown of those retail fundamentals:\n\n"
            "- **Gross Margin (%):** `(Selling Price − Purchase Cost) ÷ Selling Price × 100`. (For example, buying at ₹80 and selling at ₹100 is a 20% margin.)\n"
            "- **Operating Profit:** Gross profit minus shop overheads like rent, electricity, salaries, and transport.\n"
            "- **Working Capital:** Cash currently locked in shelf inventory plus unpaid customer Khata receivables.\n"
            "- **FEFO (First Expired, First Out):** Selling batches closest to expiry first so perishable stock doesn't turn into a write-off.",
            ["Show my actual gross margin & working capital", "Check expiring batches in my store"],
        )

    # 5b. What is AI / general educational questions for retail owners
    if (
        "artificial intelligence" in low
        or re.search(r"\bwhat\s+is\s+ai\b", low)
        or (re.search(r"\bai\b", low) and any(k in low for k in ["kirana", "small shop", "small store", "simply", "explain", "how can"]))
        or "ಎಐ ಅಂದರೆ" in low
        or "एआई क्या है" in low
    ):
        if lang == "kn":
            return (
                "**ಆರ್ಟಿಫಿಶಿಯಲ್ ಇಂಟೆಲಿಜೆನ್ಸ್ (AI)** ಎಂದರೆ ನಿಮ್ಮ ದೈನಂದಿನ ಅಂಗಡಿ ಡೇಟಾದಿಂದ ಮಾದರಿಗಳನ್ನು ಕಲಿತು ವೇಗವಾಗಿ ಲೆಕ್ಕಾಚಾರ, ಬೇಡಿಕೆ ಅಂದಾಜು ಮತ್ತು ಸ್ಮಾರ್ಟ್ ಸಲಹೆಗಳನ್ನು ನೀಡುವ ಸಾಫ್ಟ್‌ವೇರ್ ತಂತ್ರಜ್ಞಾನ.\n\n"
                "ಸಣ್ಣ ಕಿರಾಣಿ ಅಂಗಡಿಯಲ್ಲಿ ಇದನ್ನು ಬಹಳ ಸುಲಭವಾಗಿ ಬಳಸಬಹುದು:\n"
                "- **ಸ್ಟಾಕ್ ನಿರ್ವಹಣೆ:** ಯಾವ ವಸ್ತುಗಳು ಖಾಲಿಯಾಗುತ್ತಿವೆ ಎಂದು ಮುಂಚಿತವಾಗಿ ತಿಳಿಯಲು.\n"
                "- **ಬೇಡಿಕೆ ಮುನ್ಸೂಚನೆ (Predict):** ಮುಂದಿನ ವಾರ ಎಷ್ಟು ಅಕ್ಕಿ, ಬೇಳೆ, ಎಣ್ಣೆ ತರಿಸಬೇಕು ಎಂದು ಅಂದಾಜಿಸಲು.\n"
                "- **ಸರಳ ಲಾಭ-ವೆಚ್ಚ ಲೆಕ್ಕ:** ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ನೇರವಾಗಿ ಪ್ರಶ್ನೆ ಕೇಳಿ ಉತ್ತರ ಪಡೆಯಲು.\n"
                "- **ಗ್ರಾಹಕ ಸಂದೇಶಗಳು:** ಹಬ್ಬದ ಶುಭಾಶಯ ಅಥವಾ ಖಾತಾ ನೆನಪಿನ ವಾಟ್ಸಾಪ್ ಸಂದೇಶ ಬರೆಯಲು.",
                ["ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಇರುವ ವಸ್ತುಗಳು ಯಾವುವು?"],
            )
        if lang == "hi":
            return (
                "**आर्टिफिशियल इंटेलिजेंस (AI)** ऐसा स्मार्ट सॉफ्टवेयर है जो रोज़ के बिक्री और स्टॉक डेटा से पैटर्न समझकर मांग का अनुमान लगाता है और सही निर्णय लेने में मदद करता है।\n\n"
                "एक छोटी किराना दुकान में इसे आसानी से ऐसे इस्तेमाल कर सकते हैं:\n"
                "- **स्टॉक ट्रैकिंग:** कम या खत्म होने वाले सामान की समय पर जानकारी।\n"
                "- **मांग का अनुमान:** अगले हफ्ते कितना माल मंगाना है इसका स्मार्ट अंदाज़ा।\n"
                "- **तुरंत हिसाब:** बिना जटिल रिपोर्ट देखे सीधे मुनाफा, बिक्री और बकाया जानना।",
                ["इस महीने का मुनाफा बताओ", "कम स्टॉक वाले आइटम दिखाओ"],
            )
        return (
            "**Artificial Intelligence (AI)** is smart software that learns patterns from your everyday numbers to predict demand, spot problems early, and answer plain-language questions automatically.\n\n"
            "A small kirana shop can use AI very simply without technical setup:\n"
            "- **Keep inventory healthy:** Spot low-stock staples early before regular customers turn away.\n"
            "- **Predict weekly demand:** Know how much dal, oil, or rice to reorder based on actual daily sales.\n"
            "- **Instant profit & GST clarity:** Ask everyday questions in English or ಕನ್ನಡ instead of reading complex spreadsheets.\n"
            "- **Customer WhatsApp drafts:** Write polite festival wishes or payment reminders in seconds.",
            ["How much profit did I make this month?", "Which products need reordering soon?"],
        )

    # 6. Friendly General ChatGPT Fallback (Casual / Open Questions / Opinions)
    if lang == "kn":
        return (
            f"ಖಂಡಿತ {owner_name}, ನಾನು ಸಹಾಯ ಮಾಡಲು ಸಿದ್ಧನಿದ್ದೇನೆ! ನಾನು **{shop_name}** ಅಂಗಡಿಯ ಡೇಟಾದ ಜೊತೆಗೆ ಸಾಮಾನ್ಯ ವ್ಯಾಪಾರ ಸಲಹೆ, ಲೆಕ್ಕಾಚಾರ ಅಥವಾ ಗ್ರಾಹಕರ ಸಂದೇಶಗಳನ್ನು ಸಹ ಬರೆಯಬಲ್ಲೆ.\n\n"
            f"ನೀವು ಇವುಗಳಲ್ಲಿ ಯಾವುದನ್ನಾದರೂ ಕೇಳಬಹುದು:\n"
            f"- **ಅಂಗಡಿ ಲೆಕ್ಕಪತ್ರ:** *\"ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?\"* ಅಥವಾ *\"ಲಾಭ ಯಾಕೆ ಕಡಿಮೆಯಾಗಿದೆ?\"*\n"
            f"- **ಸ್ಟಾಕ್ ಮತ್ತು ಖರೀದಿ:** *\"ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ\"*\n"
            f"- **ವ್ಯಾಪಾರ ಸಲಹೆ / ಲೆಕ್ಕ:** *\"ಗ್ರಾಹಕರನ್ನು ಹೆಚ್ಚಿಸುವುದು ಹೇಗೆ?\"* ಅಥವಾ *\"50ಕ್ಕೆ ತಗೊಂಡು 65ಕ್ಕೆ ಮಾರಿದರೆ ಎಷ್ಟು % ಲಾಭ?\"*\n\n"
            f"ಇನ್ನಷ್ಟು ವಿವರವಾದ ಚಾರ್ಟ್ ಮತ್ತು ವಿಶ್ಲೇಷಣೆ ಬೇಕಿದ್ದರೆ ಸರ್ಚ್ ಬಾರ್‌ನಲ್ಲಿ **Deep** ಬಟನ್ ಒತ್ತಿ ಕೇಳಿ.",
            ["ಈ ತಿಂಗಳ ಲಾಭ ಮತ್ತು ಮಾರಾಟ ತೋರಿಸಿ", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ"],
        )
    if lang == "hi":
        return (
            f"जी {owner_name}, बिल्कुल बताइए! मैं **{shop_name}** के लाइव आंकड़ों के साथ-साथ सामान्य बिज़नेस सलाह, मुनाफा हिसाब या ग्राहकों के लिए मैसेज भी लिख सकता हूँ।\n\n"
            f"आप चाहें तो पूछ सकते हैं:\n"
            f"- *\"इस महीने का मुनाफा कितना हुआ?\"*\n"
            f"- *\"कम स्टॉक देखकर Purchase Order ड्राफ्ट बनाओ\"*\n"
            f"- *\"दुकान में ज़्यादा ग्राहक कैसे लाएँ?\"*\n\n"
            f"गहरे चार्ट और विश्लेषण के लिए सर्च बार में **Deep** मोड चुनें।",
            ["इस महीने का मुनाफा बताओ", "कम स्टॉक चेक करके PO ड्राफ्ट बनाओ"],
        )
    return (
        f"Of course, {owner_name} — happy to help! Alongside your live **{shop_name}** data, I can help with pricing math, retail ideas, customer messages, or day-to-day store decisions.\n\n"
        f"Switch between **Normal** for quick answers and **Deep** in the search bar whenever you want full SmartStock charts, tables, and root-cause analysis. What's on your mind?",
        ["How much profit did I make this month?", "Check sales, low stock & prepare a PO draft"],
    )
