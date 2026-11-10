import os
from typing import List

class Settings:
    PROJECT_NAME: str = "SmartStock Retail Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "smartstock-in-haveri-karnataka-secure-jwt-secret-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./smartstock.db")
    
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
    AI_ENABLE_BACKGROUND_MONITOR: bool = os.getenv("AI_ENABLE_BACKGROUND_MONITOR", "true").lower() == "true"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

settings = Settings()
