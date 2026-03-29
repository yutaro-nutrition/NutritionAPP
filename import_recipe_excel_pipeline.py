#!/usr/bin/env python3
from pathlib import Path

script_path = Path(__file__).resolve().parent / "scripts" / "import_recipe_excel_pipeline.py"
code = script_path.read_text(encoding="utf-8").lstrip("\ufeff")
exec(compile(code, str(script_path), "exec"))
