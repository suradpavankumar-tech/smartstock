from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def ensure_schema_compatibility():
    """Add columns introduced after the initial SQLite schema was created."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(businesses)")}
        if "tax_mode" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE businesses ADD COLUMN tax_mode VARCHAR(32) NOT NULL DEFAULT 'REGULAR_GST'"
            )
        if "upi_vpa" not in columns:
            connection.exec_driver_sql("ALTER TABLE businesses ADD COLUMN upi_vpa VARCHAR(100)")

        inv_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(invoices)")}
        if "paid_amount" not in inv_columns:
            connection.exec_driver_sql("ALTER TABLE invoices ADD COLUMN paid_amount FLOAT DEFAULT 0.0")
        if "credit_amount" not in inv_columns:
            connection.exec_driver_sql("ALTER TABLE invoices ADD COLUMN credit_amount FLOAT DEFAULT 0.0")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
