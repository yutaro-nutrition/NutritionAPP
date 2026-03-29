# Recipes Loader (Formal Spec)

## Parent/Child Model
- Parent table: `public.recipes`
- Reference view: `public.recipe_master` (read-only)
- Child tables:
  - `public.recipe_ingredients`
  - `public.recipe_steps`

## Load Order
1. `public.recipes`
2. `public.recipe_ingredients`
3. `public.recipe_steps`

## Parent Load Rules
- Source: `Recipe_Master` sheet
- Insert target: `public.recipes`
- `recipe_master` is never written.
- Existing parent handling:
  - `skip` (default, formal): keep parent/children unchanged when `recipe_id` exists
  - `replace` (formal): replace parent + children as one unit by `recipe_id`
  - `update` (legacy compatibility, formal contract outside): `ON CONFLICT (recipe_id) DO UPDATE` on parent only

## Child Load Rules
- Ingredients sheet -> `public.recipe_ingredients`
- Steps sheet -> `public.recipe_steps`
- `skip` / `update`: insert-only (`ON CONFLICT DO NOTHING`)
- `replace`: existing children are deleted and new children are inserted by `recipe_id`
- Duplicate avoidance keys:
  - `recipe_ingredients`: `(recipe_id, line_no)`
  - `recipe_steps`: `(recipe_id, step_number)`
- SQL behavior:
  - `skip` / `update`: `ON CONFLICT DO NOTHING`
  - `replace`: delete + insert

## Parent Key Validation
- Before child insert, loader validates all child `recipe_id` exist in `public.recipes`.
- If missing parent keys are detected, loader fails and transaction is rolled back.

## Validation per Import
- Before/after counts:
  - `recipes`
  - `recipe_ingredients`
  - `recipe_steps`
- Added parent `recipe_id` list
- Sample 5 recipes:
  - `ingredients_count`
  - `steps_count`
- Orphan checks:
  - children rows missing parent in `recipes`
- Duplicate checks:
  - duplicate `(recipe_id, line_no)` in `recipe_ingredients`
  - duplicate `(recipe_id, step_number)` in `recipe_steps`

## Command Examples
```bash
python load_excel_to_postgres.py \
  --excel recipe_db_main_chicken_100_batch1.xlsx \
  --db-name recipe_db \
  --host localhost --port 5432 --user postgres \
  --report reports/import_main_chicken.json
```

Dry run:
```bash
python load_excel_to_postgres.py \
  --excel recipe_db_main_chicken_100_batch1.xlsx \
  --db-name recipe_db \
  --dry-run \
  --report reports/dry_run_main_chicken.json
```

## Recommended Operations
- Use `--parent-existing-mode skip` in normal incremental operations.
- Use `--parent-existing-mode replace` when recipe-level replacement is required.
- Do not use `--parent-existing-mode update` for new formal operations. It is legacy compatibility only and does not guarantee parent-child unit consistency.
- Always keep report output enabled in batch jobs.
