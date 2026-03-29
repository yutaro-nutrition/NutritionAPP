from __future__ import annotations

import argparse
from pathlib import Path

import psycopg


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Load integrated CSVs into PostgreSQL without psql.")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", default=5432, type=int)
    p.add_argument("--database", default="postgres")
    p.add_argument("--user", default="postgres")
    p.add_argument("--password", default="")
    p.add_argument("--schema", default="mealplan")
    p.add_argument("--output-dir", default="output/integrated")
    return p.parse_args()


def create_tables(cur: psycopg.Cursor, schema: str) -> None:
    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.recipe_master_all (
            recipe_id TEXT PRIMARY KEY,
            recipe_name TEXT,
            category_lv1 TEXT,
            category_lv2 TEXT,
            category_lv3 TEXT,
            energy_kcal DOUBLE PRECISION,
            protein_g DOUBLE PRECISION,
            fat_g DOUBLE PRECISION,
            carbohydrate_g DOUBLE PRECISION,
            p_ratio DOUBLE PRECISION,
            f_ratio DOUBLE PRECISION,
            c_ratio DOUBLE PRECISION,
            tags TEXT,
            cooking_method TEXT,
            notes TEXT,
            source_file TEXT,
            source_batch TEXT,
            qa_status TEXT,
            version TEXT,
            created_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ
        );
        """
    )
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.recipe_ingredients_all (
            recipe_id TEXT NOT NULL,
            line_no INTEGER NOT NULL,
            ingredient_name TEXT,
            ingredient_alias TEXT,
            weight_g DOUBLE PRECISION,
            notes TEXT,
            source_file TEXT,
            source_batch TEXT,
            qa_status TEXT,
            version TEXT,
            PRIMARY KEY (recipe_id, line_no),
            CONSTRAINT fk_recipe_ingredients_recipe_id
              FOREIGN KEY (recipe_id)
              REFERENCES {schema}.recipe_master_all (recipe_id)
              ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.recipe_steps_all (
            recipe_id TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            instruction TEXT,
            source_file TEXT,
            source_batch TEXT,
            qa_status TEXT,
            version TEXT,
            PRIMARY KEY (recipe_id, step_number),
            CONSTRAINT fk_recipe_steps_recipe_id
              FOREIGN KEY (recipe_id)
              REFERENCES {schema}.recipe_master_all (recipe_id)
              ON DELETE CASCADE
        );
        """
    )


def copy_csv(cur: psycopg.Cursor, csv_path: Path, copy_sql: str) -> int:
    text = csv_path.read_text(encoding="utf-8-sig")
    if not text.strip():
        return 0
    lines = text.splitlines(keepends=True)
    if len(lines) <= 1:
        return 0
    payload = "".join(lines[1:])
    with cur.copy(copy_sql) as cp:
        cp.write(payload)
    return len(lines) - 1


def main() -> int:
    args = parse_args()
    root = Path(__file__).resolve().parents[2]
    out = (root / args.output_dir).resolve()
    master_csv = out / "recipe_master_all.csv"
    ing_csv = out / "recipe_ingredients_all.csv"
    step_csv = out / "recipe_steps_all.csv"
    for p in [master_csv, ing_csv, step_csv]:
        if not p.exists():
            raise FileNotFoundError(f"missing csv: {p}")

    conn = psycopg.connect(
        host=args.host,
        port=args.port,
        dbname=args.database,
        user=args.user,
        password=args.password,
        connect_timeout=5,
    )
    try:
        with conn.cursor() as cur:
            create_tables(cur, args.schema)
            cur.execute(
                f"TRUNCATE TABLE {args.schema}.recipe_steps_all, {args.schema}.recipe_ingredients_all, {args.schema}.recipe_master_all;"
            )
            master_n = copy_csv(
                cur,
                master_csv,
                f"COPY {args.schema}.recipe_master_all (recipe_id,recipe_name,category_lv1,category_lv2,category_lv3,energy_kcal,protein_g,fat_g,carbohydrate_g,p_ratio,f_ratio,c_ratio,tags,cooking_method,notes,source_file,source_batch,qa_status,version,created_at,updated_at) FROM STDIN WITH (FORMAT CSV)",
            )
            ing_n = copy_csv(
                cur,
                ing_csv,
                f"COPY {args.schema}.recipe_ingredients_all (recipe_id,line_no,ingredient_name,ingredient_alias,weight_g,notes,source_file,source_batch,qa_status,version) FROM STDIN WITH (FORMAT CSV)",
            )
            step_n = copy_csv(
                cur,
                step_csv,
                f"COPY {args.schema}.recipe_steps_all (recipe_id,step_number,instruction,source_file,source_batch,qa_status,version) FROM STDIN WITH (FORMAT CSV)",
            )
        conn.commit()
    finally:
        conn.close()

    print(f"loaded_master={master_n}")
    print(f"loaded_ingredients={ing_n}")
    print(f"loaded_steps={step_n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
