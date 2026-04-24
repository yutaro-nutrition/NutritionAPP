from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_API_ROOT = PROJECT_ROOT / "app_api"
APP_API_TESTS_ROOT = APP_API_ROOT / "tests"

for path in (APP_API_ROOT, APP_API_TESTS_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from app.core.config import settings  # noqa: E402
from app.db.session import engine  # noqa: E402
from fixtures.minimum_seed import SEED_RECIPES, ensure_minimum_seed  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply schema + minimum app_api test seed into a safe test DB."
    )
    parser.add_argument(
        "--allow-db-name",
        action="append",
        default=["recipe_test_db"],
        help="Allowed database name (repeatable). default: recipe_test_db",
    )
    return parser.parse_args()


def is_dangerous_name(db_name: str) -> bool:
    lowered = db_name.lower()
    return any(token in lowered for token in ("prod", "production", "live"))


def guard_db_target(allowed_db_names: list[str]) -> None:
    db_name = settings.postgres_db
    allowed = {x.strip() for x in allowed_db_names if x and x.strip()}
    if db_name not in allowed:
        raise RuntimeError(
            f"Refusing to seed db='{db_name}'. Allowed db names: {sorted(allowed)}"
        )
    if is_dangerous_name(db_name):
        raise RuntimeError(
            f"Refusing to seed dangerous-looking db name: '{db_name}'"
        )


def summarize() -> dict[str, int]:
    recipe_ids = [x.recipe_id for x in SEED_RECIPES]
    with engine.connect() as conn:
        total_recipes = int(conn.execute(text("SELECT COUNT(*) FROM recipes")).scalar_one())
        total_ingredients = int(conn.execute(text("SELECT COUNT(*) FROM recipe_ingredients")).scalar_one())
        total_steps = int(conn.execute(text("SELECT COUNT(*) FROM recipe_steps")).scalar_one())
        seeded_recipes = int(
            conn.execute(
                text("SELECT COUNT(*) FROM recipes WHERE recipe_id = ANY(:ids)"),
                {"ids": recipe_ids},
            ).scalar_one()
        )
    return {
        "total_recipes": total_recipes,
        "total_ingredients": total_ingredients,
        "total_steps": total_steps,
        "seeded_recipes": seeded_recipes,
    }


def main() -> int:
    args = parse_args()
    guard_db_target(args.allow_db_name)
    ensure_minimum_seed(engine)
    summary = summarize()
    print("minimum_test_seed: success")
    print(f"db_target={settings.db_target_label}")
    print(f"seed_recipe_count={len(SEED_RECIPES)}")
    print(
        "table_counts: recipes={total_recipes}, ingredients={total_ingredients}, steps={total_steps}, seeded_recipes={seeded_recipes}".format(
            **summary
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
