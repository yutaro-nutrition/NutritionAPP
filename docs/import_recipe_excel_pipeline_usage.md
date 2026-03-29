# import_recipe_excel_pipeline.py Usage

## Purpose
Single-command pre-import gate for recipe Excel files.

The pipeline does the following:
1. Detect input format (legacy or canonical)
2. Convert legacy workbook to canonical when needed
3. Run canonical validation
4. Block DB import when validation fails
5. Allow DB import only when validation passes (`passed` / `passed_with_warnings`)
6. Write a JSON pipeline report

## Command
From project root:

```bash
python import_recipe_excel_pipeline.py input.xlsx
```

Or call script directly:

```bash
python scripts/import_recipe_excel_pipeline.py input.xlsx
```

## Main Options

```bash
python import_recipe_excel_pipeline.py input.xlsx --output-dir output/pipeline
python import_recipe_excel_pipeline.py input.xlsx --skip-convert
python import_recipe_excel_pipeline.py input.xlsx --skip-validate
python import_recipe_excel_pipeline.py input.xlsx --import-db
python import_recipe_excel_pipeline.py input.xlsx --json
python import_recipe_excel_pipeline.py input.xlsx --fail-on-warning
```

## DB Import Options

```bash
python import_recipe_excel_pipeline.py input.xlsx --import-db \
  --db-host localhost --db-port 5432 \
  --db-name recipe_db --db-user postgres --db-password <PASSWORD> \
  --db-schema public --parent-existing-mode skip
```

`--parent-existing-mode` guidance:
- `skip` (formal): 既存 `recipe_id` の親子を変更しない
- `replace` (formal): 既存 `recipe_id` を親子一体で置換する
- `update` (legacy compatibility): 正式契約外。親子一体更新を保証しないため、新規運用では非推奨

Test double loader injection:

```bash
python import_recipe_excel_pipeline.py input.xlsx --import-db \
  --db-loader-script tests/fake_db_loader.py
```

Dry run import:

```bash
python import_recipe_excel_pipeline.py input.xlsx --import-db --dry-run
```

## Gate Rules
- Validation `failed` -> gate blocks DB import
- Validation `passed` -> gate allows DB import
- Validation `passed_with_warnings` -> gate allows DB import
- `--fail-on-warning` with warnings -> gate blocks DB import

## Output Artifacts
Default output directory: `output/pipeline`

Generated files include:
- Canonical workbook (if conversion executed)
- Loader-compatible workbook for DB import
- DB import report (when `--import-db`)
- Pipeline report JSON (`import_pipeline_report_<run_id>.json`)

## Exit Code
- `0`: pipeline passed (`passed` or `passed_with_warnings`)
- `1`: pipeline failed (convert / validate / db import errors)
