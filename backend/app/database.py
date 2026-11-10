from sqlalchemy import create_engine, event, inspect
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

database_url = settings.DATABASE_URL
if database_url.startswith("postgres://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgres://"):]
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgresql://"):]

is_sqlite = database_url.startswith("sqlite")

if is_sqlite:
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=5,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_tables_initialized():
    """Create missing tables safely, including concurrent cold starts on Postgres."""
    if is_sqlite:
        Base.metadata.create_all(bind=engine)
        ensure_schema_compatibility()
        return

    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except (IntegrityError, ProgrammingError) as exc:
        # Handle concurrent cold-start DDL races (e.g., duplicate enum/table creation)
        inspector = inspect(engine)
        if not inspector.has_table("businesses"):
            raise exc

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
