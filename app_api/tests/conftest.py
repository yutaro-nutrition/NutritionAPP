from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = PROJECT_ROOT / "app_api"
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

os.environ.setdefault("POSTGRES_DB", "recipe_db")
os.environ.setdefault("APP_API_MENU_RANDOM_SEED", "20260330")

from app.db.session import engine
from fixtures.minimum_seed import ensure_minimum_seed


@pytest.fixture(scope="session", autouse=True)
def prepare_app_api_test_seed() -> None:
    if os.getenv("APP_API_TEST_AUTO_SEED", "1") != "1":
        return
    ensure_minimum_seed(engine)

