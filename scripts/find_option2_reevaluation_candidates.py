#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_QUERY = ROOT / "app_api" / "sql" / "queries" / "find_option2_reevaluation_candidates.sql"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Find Option2 re-evaluation candidates (read-only).")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--db-name", default="recipe_db")
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--password", default="")
    parser.add_argument("--query", default=str(DEFAULT_QUERY))
    parser.add_argument("--output-json", default="")
    parser.add_argument("--output-csv", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    query_path = Path(args.query).resolve()
    if not query_path.exists():
        print(json.dumps({"status": "failed", "error": f"query file not found: {query_path}"}, ensure_ascii=False))
        return 1

    query_text = query_path.read_text(encoding="utf-8")

    with psycopg.connect(
        host=args.host,
        port=args.port,
        dbname=args.db_name,
        user=args.user,
        password=args.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(query_text)
            rows = cur.fetchall()
            cols = [d.name for d in cur.description]

    records = [dict(zip(cols, row)) for row in rows]
    summary = {
        "status": "ok",
        "query": str(query_path),
        "count": len(records),
        "by_candidate_type": {},
    }
    for rec in records:
        key = str(rec.get("candidate_type"))
        summary["by_candidate_type"][key] = summary["by_candidate_type"].get(key, 0) + 1

    result = {"summary": summary, "records": records}

    if args.output_json:
        out_json = Path(args.output_json)
        out_json.parent.mkdir(parents=True, exist_ok=True)
        out_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    if args.output_csv:
        out_csv = Path(args.output_csv)
        out_csv.parent.mkdir(parents=True, exist_ok=True)
        with out_csv.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=cols)
            writer.writeheader()
            writer.writerows(records)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
