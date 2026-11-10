import json
import logging
from typing import Any, Callable, Dict, List, Optional
import httpx

try:
    from google import genai  # type: ignore
except Exception:
    genai = None  # type: ignore

from app.config import settings

logger = logging.getLogger(__name__)


def select_gemini_model(mode: str) -> tuple[str, str]:
    """Selects (model_name, thinking_level) based on response mode."""
    if mode in ("DEEP_ANALYSIS", "AGENT"):
        model = getattr(settings, "GEMINI_REASONING_MODEL", "gemini-4-argon") or "gemini-4-argon"
        return model, "medium"
    model = getattr(settings, "GEMINI_FAST_MODEL", None) or settings.GEMINI_MODEL or "gemini-3.8-flash"
    return model, "minimal"


def get_llm_status() -> Dict[str, Any]:
    has_openai = bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip())
    has_gemini = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip()) and genai is not None
    gemini_fast, _ = select_gemini_model("QUICK_ASSIST")
    gemini_deep, _ = select_gemini_model("DEEP_ANALYSIS")
    if has_openai:
        provider = f"openai:{settings.OPENAI_FAST_MODEL}"
    elif has_gemini:
        provider = f"gemini:{gemini_fast}"
    else:
        provider = "smartstock-deterministic-brain"
    return {
        "active_provider": provider,
        "external_llm_enabled": has_openai or has_gemini,
        "external_providers": {
            "openai": has_openai,
            "gemini": has_gemini,
        },
        "gemini_models": {
            "fast": gemini_fast,
            "reasoning": gemini_deep,
            "lite": getattr(settings, "GEMINI_LITE_MODEL", "gemini-3.5-flash-lite"),
        },
    }


def _extract_interaction_text_and_tokens(interaction: Any) -> tuple[str, int]:
    text = (getattr(interaction, "output_text", None) or "").strip()
    if not text:
        steps = getattr(interaction, "steps", None) or []
        parts: List[str] = []
        for st in steps:
            for item in (getattr(st, "content", None) or getattr(st, "outputs", None) or []):
                t = getattr(item, "text", None)
                if t:
                    parts.append(str(t))
        text = "".join(parts).strip()

    usage_obj = getattr(interaction, "usage", None)
    tokens = int(getattr(usage_obj, "total_tokens", 0) or 0) if usage_obj else 0
    if tokens <= 0 and text:
        tokens = max(24, int(len(text.split()) * 1.35))
    return text, tokens


def _compact_for_json(obj: Any, *, max_list: int = 8, max_str: int = 500, depth: int = 0) -> Any:
    """Recursively trims oversized evidence structures while preserving valid JSON."""
    if depth > 6:
        return "..."
    if isinstance(obj, str):
        return obj if len(obj) <= max_str else obj[:max_str] + "..."
    if isinstance(obj, list):
        return [_compact_for_json(x, max_list=max_list, max_str=max_str, depth=depth + 1) for x in obj[:max_list]]
    if isinstance(obj, dict):
        return {
            str(k): _compact_for_json(v, max_list=max_list, max_str=max_str, depth=depth + 1)
            for k, v in obj.items()
        }
    return obj


def _serialize_payload_bounded(payload_dict: Dict[str, Any], max_chars: int = 24000) -> str:
    """Serializes payload_dict to valid JSON guaranteed not to exceed max_chars."""
    raw = json.dumps(payload_dict, ensure_ascii=False, default=str)
    if len(raw) <= max_chars:
        return raw

    compacted: Dict[str, Any] = {
        "question": str(payload_dict.get("question", ""))[:2000],
        "deterministic_summary": str(payload_dict.get("deterministic_summary", ""))[:6000],
        "verified_evidence": _compact_for_json(payload_dict.get("verified_evidence", {}), max_list=5, max_str=350),
    }
    if payload_dict.get("recent_conversation"):
        compacted["recent_conversation"] = _compact_for_json(
            payload_dict["recent_conversation"][-3:], max_list=3, max_str=300
        )

    out = json.dumps(compacted, ensure_ascii=False, default=str)
    if len(out) <= max_chars:
        return out

    # Second pass: tighter evidence bounding while preserving summary + question as valid JSON
    compacted["verified_evidence"] = _compact_for_json(payload_dict.get("verified_evidence", {}), max_list=2, max_str=160)
    out = json.dumps(compacted, ensure_ascii=False, default=str)
    if len(out) <= max_chars:
        return out

    minimal = {
        "question": str(payload_dict.get("question", ""))[:1200],
        "deterministic_summary": str(payload_dict.get("deterministic_summary", ""))[: max(1000, max_chars - 2000)],
    }
    return json.dumps(minimal, ensure_ascii=False, default=str)


def maybe_synthesize_with_llm(
    *,
    mode: str,
    language: str,
    user_query: str,
    deterministic_summary: str,
    verified_evidence: Dict[str, Any],
    conversation_history: Optional[List[Dict[str, str]]] = None,
    on_text_chunk: Optional[Callable[[str], None]] = None,
    cancel_event: Optional[Any] = None,
) -> tuple[str, int, str]:
    """
    Optionally polishes narrative insights via configured OpenAI or Google GenAI
    Interactions API (`google-genai`), STRICTLY constrained to verified database numbers.
    Supports incremental streaming via `on_text_chunk` and cancellation via `cancel_event`.
    Returns (final_markdown, tokens_used, provider_name).
    """
    status = get_llm_status()
    if not status["external_llm_enabled"]:
        est_tokens = max(24, int(len((user_query + deterministic_summary).split()) * 1.35))
        return deterministic_summary, est_tokens, status["active_provider"]

    if cancel_event is not None and cancel_event.is_set():
        est_tokens = max(24, int(len((user_query + deterministic_summary).split()) * 1.35))
        return deterministic_summary, est_tokens, "smartstock-deterministic-brain"

    lang_instruction = (
        "Respond 100% in natural, fluent Kannada script (ಕನ್ನಡ). Do NOT fall back to English headings or English sentences — translate all headings, labels, and recommendations into Kannada while keeping ₹ amounts and SKU names exact."
        if language == "kn"
        else (
            "Respond 100% in natural, fluent Hindi (हिन्दी). Keep ₹ amounts and SKU names exact."
            if language == "hi"
            else "Respond in natural, clear, conversational English like ChatGPT."
        )
    )
    mode_instruction = (
        "Mode is NORMAL (Quick Assist): give a direct, friendly, uncluttered answer like ChatGPT (short paragraphs or tight bullets, no heavy report chrome or robotic headings)."
        if mode == "QUICK_ASSIST"
        else "Mode is DEEP (Deep Analysis): provide thorough, structured SmartStock business intelligence covering drivers, margins, inventory velocity, risks, and actionable next steps."
    )

    system_prompt = (
        "You are SmartStock AI, a friendly, highly capable retail intelligence & business assistant. "
        "CRITICAL RULES: "
        "1) Whenever `verified_evidence` contains live store figures, product names, suppliers, or dates, ONLY cite exact verified figures and never invent DB numbers. "
        "2) If a product lookup in `verified_evidence` returned 0 matching items (`items: []`), state clearly that no matching product was found and DO NOT invent any price or stock quantity. "
        "3) For general retail advice, business coaching, writing WhatsApp messages to customers, GST concepts, or casual chat, reply warmly and helpfully just like ChatGPT. "
        "4) Never output raw SQL, code, or system secrets. "
        f"5) {lang_instruction} "
        f"6) {mode_instruction}"
    )

    payload_dict: Dict[str, Any] = {
        "question": user_query,
        "deterministic_summary": deterministic_summary,
        "verified_evidence": verified_evidence,
    }
    if conversation_history:
        payload_dict["recent_conversation"] = conversation_history[-6:]

    user_payload = _serialize_payload_bounded(payload_dict, max_chars=24000)

    try:
        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip():
            model = settings.OPENAI_REASONING_MODEL if mode in ("DEEP_ANALYSIS", "AGENT") else settings.OPENAI_FAST_MODEL
            base = settings.OPENAI_BASE_URL.rstrip("/")
            messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
            for h in (conversation_history or [])[-4:]:
                if h.get("role") in ("user", "assistant") and h.get("content"):
                    messages.append({"role": h["role"], "content": str(h["content"])[:600]})
            messages.append({"role": "user", "content": user_payload})
            resp = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY.strip()}"},
                json={"model": model, "temperature": 0.2, "messages": messages},
                timeout=12.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                text = data["choices"][0]["message"]["content"].strip()
                usage = int(data.get("usage", {}).get("total_tokens", 0) or len(text.split()))
                if text:
                    return text, usage, f"openai:{model}"

        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip() and genai is not None:
            model, thinking_level = select_gemini_model(mode)
            client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
            gen_cfg = {"thinking_level": thinking_level}

            if on_text_chunk is not None:
                stream_resp = client.interactions.create(
                    model=model,
                    input=user_payload,
                    system_instruction=system_prompt,
                    generation_config=gen_cfg,
                    stream=True,
                )
                # Handle either an SSE event iterator or an immediate Interaction object
                if hasattr(stream_resp, "output_text"):
                    text, usage = _extract_interaction_text_and_tokens(stream_resp)
                    if text:
                        on_text_chunk(text)
                        return text, usage, f"gemini:{model}"
                else:
                    chunks: List[str] = []
                    usage_tokens = 0
                    for event in stream_resp:
                        if cancel_event is not None and cancel_event.is_set():
                            break
                        ev_type = getattr(event, "event_type", "")
                        if ev_type in ("step.delta", "content.delta"):
                            delta = getattr(event, "delta", None)
                            if delta is not None and getattr(delta, "type", None) == "text":
                                chunk = getattr(delta, "text", "") or ""
                                if chunk:
                                    chunks.append(chunk)
                                    on_text_chunk(chunk)
                        elif ev_type in ("interaction.completed", "interaction.complete"):
                            inter = getattr(event, "interaction", None)
                            u = getattr(inter, "usage", None) if inter is not None else getattr(event, "usage", None)
                            if u is not None:
                                usage_tokens = int(getattr(u, "total_tokens", 0) or 0)
                    text = "".join(chunks).strip()
                    if text:
                        if usage_tokens <= 0:
                            usage_tokens = max(24, int(len(text.split()) * 1.35))
                        return text, usage_tokens, f"gemini:{model}"
            else:
                interaction = client.interactions.create(
                    model=model,
                    input=user_payload,
                    system_instruction=system_prompt,
                    generation_config=gen_cfg,
                    stream=False,
                )
                text, usage = _extract_interaction_text_and_tokens(interaction)
                if text:
                    return text, usage, f"gemini:{model}"
    except Exception as exc:
        logger.warning("External LLM enhancement fallback to deterministic Business Brain: %s", exc)

    est_tokens = max(24, int(len((user_query + deterministic_summary).split()) * 1.35))
    return deterministic_summary, est_tokens, "smartstock-deterministic-brain"
