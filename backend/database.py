import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# load_dotenv must run before os.getenv so values in .env are applied at
# module import time, regardless of import order in main.py.
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./testgen.db")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# SQLite disables foreign-key enforcement per connection by default, so ON DELETE
# CASCADE is a no-op unless we turn it on for every connection. Postgres enforces
# FKs natively, so this listener is a SQLite-only concern (the guard keeps it from
# firing for other backends). Without it, cascade deletes would silently leave
# orphans on SQLite while working on Postgres.
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ANN001
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _safe_db_url() -> str:
    """Return DATABASE_URL with any password component masked for logging."""
    if "://" in DATABASE_URL and "@" in DATABASE_URL:
        scheme, rest = DATABASE_URL.split("://", 1)
        userinfo, hostpath = rest.rsplit("@", 1)
        user = userinfo.split(":")[0]
        return f"{scheme}://{user}:***@{hostpath}"
    return DATABASE_URL
