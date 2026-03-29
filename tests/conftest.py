from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

ROOT_DIR = Path(__file__).resolve().parents[1]
PIPELINE_SCRIPT = ROOT_DIR / "scripts" / "import_recipe_excel_pipeline.py"
CREATE_TABLES_SQL = ROOT_DIR / "app_api" / "sql" / "create_tables.sql"
MIGRATIONS_DIR = ROOT_DIR / "app_api" / "sql" / "migrations"


@dataclass(frozen=True)
class PostgresTestConfig:
    host: str
    port: int
    db_name: str
    user: str
    password: str
    schema: str = "public"


def parse_json_stdout(proc: subprocess.CompletedProcess[str]) -> dict:
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"stdout is not valid JSON:\n{proc.stdout}\nstderr:\n{proc.stderr}") from exc


def run_pipeline_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(PIPELINE_SCRIPT), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=ROOT_DIR,
        check=False,
    )


@pytest.fixture(scope="session")
def postgres_test_config() -> PostgresTestConfig:
    return PostgresTestConfig(
        host=os.getenv("TEST_POSTGRES_HOST", "127.0.0.1"),
        port=int(os.getenv("TEST_POSTGRES_PORT", "55432")),
        db_name=os.getenv("TEST_POSTGRES_DB", "recipe_test_db"),
        user=os.getenv("TEST_POSTGRES_USER", "recipe_test_user"),
        password=os.getenv("TEST_POSTGRES_PASSWORD", "recipe_test_password"),
        schema=os.getenv("TEST_POSTGRES_SCHEMA", "public"),
    )


@pytest.fixture(scope="session")
def postgres_ready(postgres_test_config: PostgresTestConfig) -> PostgresTestConfig:
    cfg = postgres_test_config
    try:
        with psycopg.connect(
            host=cfg.host,
            port=cfg.port,
            dbname=cfg.db_name,
            user=cfg.user,
            password=cfg.password,
            connect_timeout=3,
            autocommit=True,
        ) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    except Exception as exc:
        pytest.skip(
            "PostgreSQL integration tests skipped. "
            "Start docker compose or set TEST_POSTGRES_* correctly. "
            f"connection_error={exc}"
        )
    return cfg


@pytest.fixture(scope="session")
def postgres_isolated_config(postgres_ready: PostgresTestConfig) -> PostgresTestConfig:
    explicit_schema = os.getenv("TEST_POSTGRES_SCHEMA")
    schema = explicit_schema if explicit_schema else f"it_{uuid.uuid4().hex[:12]}"
    return PostgresTestConfig(
        host=postgres_ready.host,
        port=postgres_ready.port,
        db_name=postgres_ready.db_name,
        user=postgres_ready.user,
        password=postgres_ready.password,
        schema=schema,
    )


@pytest.fixture(scope="session")
def ensure_test_tables(postgres_isolated_config: PostgresTestConfig) -> PostgresTestConfig:
    sql_text = CREATE_TABLES_SQL.read_text(encoding="utf-8")
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    cfg = postgres_isolated_config
    owns_schema = os.getenv("TEST_POSTGRES_SCHEMA") is None
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(cfg.schema)))
            cur.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(cfg.schema)))
            cur.execute(sql_text)
            for migration_file in migration_files:
                migration_sql = migration_file.read_text(encoding="utf-8")
                cur.execute(migration_sql)
    try:
        yield cfg
    finally:
        if owns_schema:
            with psycopg.connect(
                host=cfg.host,
                port=cfg.port,
                dbname=cfg.db_name,
                user=cfg.user,
                password=cfg.password,
                autocommit=True,
            ) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(cfg.schema)))


@pytest.fixture()
def clean_test_tables(ensure_test_tables: PostgresTestConfig) -> PostgresTestConfig:
    cfg = ensure_test_tables
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("TRUNCATE TABLE {}.recipe_steps, {}.recipe_ingredients, {}.recipes RESTART IDENTITY CASCADE").format(
                    sql.Identifier(cfg.schema),
                    sql.Identifier(cfg.schema),
                    sql.Identifier(cfg.schema),
                )
            )
    return cfg


def fetch_table_counts(cfg: PostgresTestConfig) -> dict[str, int]:
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            out: dict[str, int] = {}
            for table in ("recipes", "recipe_ingredients", "recipe_steps"):
                cur.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}.{}").format(sql.Identifier(cfg.schema), sql.Identifier(table))
                )
                out[table] = int(cur.fetchone()[0])
    return out


def fetch_recipe_row(cfg: PostgresTestConfig, recipe_id: str) -> dict[str, str] | None:
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT recipe_id, recipe_name, version FROM {}.recipes WHERE recipe_id = %s"
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return {"recipe_id": str(row[0]), "recipe_name": str(row[1]), "version": str(row[2])}


def fetch_child_rows(cfg: PostgresTestConfig, recipe_id: str) -> dict[str, str | None]:
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT ingredient_name FROM {}.recipe_ingredients WHERE recipe_id = %s AND line_no = 1"
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            ingredient = cur.fetchone()

            cur.execute(
                sql.SQL(
                    "SELECT instruction FROM {}.recipe_steps WHERE recipe_id = %s AND step_number = 1"
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            step = cur.fetchone()

    return {
        "ingredient_name_line1": None if ingredient is None else str(ingredient[0]),
        "step_instruction_1": None if step is None else str(step[0]),
    }
