# API / Menu MVP Spec

## Scope
- Read-only access to PostgreSQL recipe DB.
- Parent table baseline: `public.recipes`
- Child reference:
  - `public.recipe_ingredients`
  - `public.recipe_steps`
- No write/update APIs in this phase.

## Base
- Framework: FastAPI
- App entrypoint: `app_api/app/main.py`

## Endpoints

### `GET /recipes`
Recipe list search with filters.

Query params:
- `category` (string)
- `meal_type` (string, partial match against tags/notes)
- `tags` (comma-separated string, partial match)
- `min_energy_kcal`, `max_energy_kcal`
- `min_protein_g`, `max_protein_g`
- `min_fat_g`, `max_fat_g`
- `min_carbohydrate_g`, `max_carbohydrate_g`
- `limit` (1-100)
- `offset` (>=0)

Response:
- `total`
- `limit`
- `offset`
- `items[]` (recipe summary)

Vocabulary guidance:
- Recommended `meal_type` codes: `breakfast`, `lunch`, `dinner`, `snack`
- Backward-compatible aliases are accepted (examples: `朝食`, `試合前`, `試合後`)
- For frontend fixed options, use `GET /meta/options`

### `GET /recipes/{recipe_id}`
Recipe detail.

Response:
- Recipe master fields
- `ingredients[]` (line_no order)
- `steps[]` (step_number order)

Errors:
- `404` when recipe does not exist.
- `422` when request validation fails.

### `POST /menu/generate`
Rule-based MVP menu generation.

Request:
- `target_kcal` (required, >0)
- `target_protein_g` (required, >=0)
- `meal_type` (optional)
- `scene` (optional)
- `include_dessert` (optional, default `true`)

Response:
- 3 menu patterns (`patterns[]`)
- Each pattern includes:
  - slots: staple/main/side/soup (+ optional dessert)
  - totals (`total_kcal`, `total_protein_g`)
  - constraint flags:
    - `within_kcal_range` (target kcal ±20%)
    - `protein_target_met` (protein lower-bound)
  - explainability fields:
    - `nutrition_summary`
    - `constraint_evaluation`
    - `applied_conditions` (`scene_normalized`/`meal_type_normalized` included when recognized)
    - `generation_note`

Errors:
- `400` for invalid parameter.
- `404` when no candidates satisfy required slots or protein floor.
- `422` for request validation errors.

### `GET /meta/options`
Provides recommended vocabulary and compatibility aliases for frontend fixed options.

Response:
- `meal_type[]`: `code`, `label_ja`, `aliases`
- `scene[]`: `code`, `label_ja`, `aliases`
- `tags_recommended`: grouped recommended tag vocabulary
- `notes`: compatibility and implementation notes

## Unified Error Response
All error responses return the same shape:

```json
{
  "error_code": "VALIDATION_ERROR",
  "detail": "..."
}
```

`error_code` list:
- `RECIPE_NOT_FOUND`
- `INVALID_PARAMETER`
- `MENU_GENERATION_FAILED`
- `NO_RECIPES_FOUND`
- `VALIDATION_ERROR`

OpenAPI documentation:
- `/recipes/{recipe_id}` documents `404` and `422` with `ErrorResponse`.
- `/menu/generate` documents `400`, `404`, and `422` with `ErrorResponse`.

## Vocabulary Policy
Recommended `meal_type`:
- `breakfast`
- `lunch`
- `dinner`
- `snack`

Recommended `scene`:
- `pre_game`
- `post_game`
- `bulking`
- `cutting`
- `recovery`
- `normal`

Recommended tags (by category):
- `performance_goal`: `high_protein`, `low_fat`, `high_carb`, `recovery_support`
- `timing`: `pre_game`, `post_game`, `snack`
- `nutrition_feature`: `high_protein`, `low_fat`, `high_carb`, `easy_digest`
- `user_need`: `quick_energy`, `recovery_support`, `light_meal`

Compatibility policy:
- Japanese aliases are accepted for existing clients.
- Matching remains partial-match based on tags/notes to avoid breaking behavior.
- New frontend implementations should send code values and keep labels in UI.

## Category Slot Inference (MVP)
Because many records have `category_lv1='unknown'`, slot classification uses both category and recipe_id prefixes:
- staple: `category_lv1='主食'` or `RICE|UDON|SOBA|RAMEN|BREAD|DONBURI`
- main: `category_lv1='主菜'` or `MAIN_`
- side: `category_lv1='副菜'` or `SIDE_`
- soup: `category_lv1='汁物'` or `SOUP_`
- dessert: `category_lv1='デザート'` or `DESSERT_`

## Menu Generation Rules (MVP)
- Base composition: staple1 + main1 + side1 + soup1 (+ optional dessert)
- Targets:
  - kcal range: `target_kcal * [0.8, 1.2]`
  - protein: prioritize `>= target_protein_g`
- Candidate selection:
  - random combinations (deduplicated)
  - rank by protein gap first, then kcal gap
  - return top 3 patterns
- Filter fallback:
  - Try `(meal_type + scene)` first
  - If slot pool empty, relax constraints in stages to keep output available

## Frontend Integration Docs
- `docs/frontend_api_integration_guide.md`
- `docs/error_ui_mapping_guide.md`
- `docs/api_vocabulary_guide.md`
