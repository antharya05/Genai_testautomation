import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# load_dotenv must run before os.getenv so values in .env are applied at
# module import time, regardless of import order in main.py.
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./testgen.db")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _safe_db_url() -> str:
    """Return DATABASE_URL with any password component masked for logging."""
    if "://" in DATABASE_URL and "@" in DATABASE_URL:
        scheme, rest = DATABASE_URL.split("://", 1)
        userinfo, hostpath = rest.rsplit("@", 1)
        user = userinfo.split(":")[0]
        return f"{scheme}://{user}:***@{hostpath}"
    return DATABASE_URL
