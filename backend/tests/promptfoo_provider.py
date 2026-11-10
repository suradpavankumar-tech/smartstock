"""
Promptfoo custom Python provider for offline/CI evaluation of SmartStock AI Ultra.
Usage: npx promptfoo eval -c tests/promptfooconfig.yaml
"""

import json
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict

_TESTS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _TESTS_DIR.parent
for _p in (str(_BACKEND_DIR), str(_TESTS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from sqlalchemy.orm import Session

# Reuse the seeded CI WAL fixture helpers
from test_ai_ultra_eval_ci import _build_ctx, _setup_wal_eval_db
from app.smartstock_ai.orchestrator import run_ai_ultra_turn

_DB_PATH = Path(tempfile.gettempdir()) / "smartstock_promptfoo_eval.db"
_STATE: Dict[str, Any] = {}


def _ensure_state():
    if not _STATE:
        engine, SessionLocal, ids = _setup_wal_eval_db(_DB_PATH)
        _STATE["engine"] = engine
        _STATE["SessionLocal"] = SessionLocal
        _STATE["ids"] = ids
    return _STATE["SessionLocal"], _STATE["ids"]


def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    SessionLocal, ids = _ensure_state()
    vars_dict = (context or {}).get("vars") or {}
    mode = vars_dict.get("mode", "QUICK_ASSIST")
    role = vars_dict.get("role", "OWNER")
    language = vars_dict.get("language", "auto")

    with SessionLocal() as db:  # type: Session
        ctx = _build_ctx(db, ids, role=role)
        res = run_ai_ultra_turn(
            db,
            ctx,
            message=prompt,
            mode=mode,
            language=language,
        )
        am = res.assistant_message
        return {
            "output": am.content,
            "metadata": {
                "intent": am.intent,
                "detected_language": res.detected_language,
                "agents": [a.agent_name for a in am.payload.agents_involved],
                "tools": [t.tool_name for t in am.payload.tool_traces if t.status == "COMPLETED"],
                "data_quality": am.payload.data_quality,
            },
        }
