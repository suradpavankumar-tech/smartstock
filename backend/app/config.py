import os
from typing import List


def _resolve_database_url() -> str:
    raw = (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or "sqlite:///./smartstock.db"
    ).strip()
    if raw.startswith("postgres://"):
        return "postgresql+psycopg://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://"):
        return "postgresql+psycopg://" + raw[len("postgresql://"):]
    return raw


def _build_cors_origins() -> List[str]:
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    extra = os.getenv("CORS_ORIGINS", "")
    for item in extra.split(","):
        cleaned = item.strip().rstrip("/")
        if cleaned and cleaned not in origins:
            origins.append(cleaned)
    for host_var in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        host = os.getenv(host_var, "").strip()
        if host:
            origin = host if host.startswith(("http://", "https://")) else f"https://{host}"
            origin = origin.rstrip("/")
            if origin not in origins:
                origins.append(origin)
    return origins


class Settings:
    PROJECT_NAME: str = "SmartStock Retail Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    IS_SERVERLESS: bool = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "smartstock-in-haveri-karnataka-secure-jwt-secret-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Database
    DATABASE_URL: str = _resolve_database_url()
    
    # Regional Defaults (Karnataka, India)
    DEFAULT_TIMEZONE: str = "Asia/Kolkata"
    DEFAULT_CURRENCY: str = "INR"
    DEFAULT_LOCALE: str = "kn-IN"

    # SmartStock AI Ultra Configuration (Optional External LLM Providers)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_FAST_MODEL: str = os.getenv("OPENAI_FAST_MODEL", "gpt-4o-mini")
    OPENAI_REASONING_MODEL: str = os.getenv("OPENAI_REASONING_MODEL", "gpt-4o")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    GEMINI_FAST_MODEL: str = os.getenv("GEMINI_FAST_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.8-flash"))
    GEMINI_REASONING_MODEL: str = os.getenv("GEMINI_REASONING_MODEL", "gemini-4-argon")
    GEMINI_LITE_MODEL: str = os.getenv("GEMINI_LITE_MODEL", "gemini-3.5-flash-lite")
    AI_PROACTIVE_SCAN_INTERVAL_SEC: int = int(os.getenv("AI_PROACTIVE_SCAN_INTERVAL_SEC", "900"))
    AI_ENABLE_BACKGROUND_MONITOR: bool = (
        os.getenv(
            "AI_ENABLE_BACKGROUND_MONITOR",
            "false" if bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV")) else "true",
        ).lower()
        == "true"
    )

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = _build_cors_origins()

settings = Settings()
