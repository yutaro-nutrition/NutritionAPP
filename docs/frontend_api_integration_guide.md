# Frontend API Integration Guide

## Scope
This guide is for Web / mobile frontend integration using the current API set:
- `GET /health`
- `GET /meta/options`
- `GET /recipes`
- `GET /recipes/{recipe_id}`
- `POST /menu/generate`

It assumes:
- Unified error shape: `{ error_code, detail }`
- Menu explainability fields: `nutrition_summary`, `constraint_evaluation`, `applied_conditions`, `generation_note`
- Vocabulary guidance via `/meta/options`

## Screen-by-Screen Mapping

### 1) App Startup / Initial Load
- Purpose: initialize fixed options and app state.
- API: `GET /meta/options` (required), optional `GET /health` for diagnostics.
- Request: none.
- Main response fields:
  - `meal_type[]`, `scene[]`, `tags_recommended`, `notes`
- UI usage:
  - Build dropdown/radio options from `code + label_ja`.
  - Keep aliases for backward compatibility display.
- Error handling:
  - show retry CTA and fallback to local cached options.
- Notes:
  - cache options in memory + local storage.

### 2) Recipe List Screen
- Purpose: searchable/paged recipe browsing.
- API: `GET /recipes`.
- Required request fields: none.
- Typical request fields:
  - `category`, `meal_type`, `tags`, nutrition ranges, `limit`, `offset`
- Main response fields:
  - `total`, `limit`, `offset`, `items[]`
- UI usage:
  - card list from `items[]`
  - pagination from `total`, `limit`, `offset`
- Error handling:
  - `VALIDATION_ERROR`: show form-level correction prompt.
- Notes:
  - 0-result is valid; show empty-state suggestions.

### 3) Recipe Detail Screen
- Purpose: full recipe consumption.
- API: `GET /recipes/{recipe_id}`.
- Required request fields: `recipe_id`.
- Main response fields:
  - nutrition fields, `ingredients[]`, `steps[]`, `tags`, `notes`
- UI usage:
  - ingredients table + steps timeline
  - nutrition summary card
- Error handling:
  - `RECIPE_NOT_FOUND`: navigate back to list + toast.
- Notes:
  - deep link should handle missing IDs gracefully.

### 4) Menu Condition Input Screen
- Purpose: collect menu generation conditions.
- API: `GET /meta/options` (option source), `POST /menu/generate` (submit).
- Required request fields: `target_kcal`, `target_protein_g`.
- Main response fields used on submit: `patterns[]`.
- UI usage:
  - selectors driven by `/meta/options`
  - send `code` values; display `label_ja`
- Error handling:
  - `VALIDATION_ERROR` / `INVALID_PARAMETER`: highlight invalid input.
- Notes:
  - keep defaults: include dessert = true.

### 5) Menu Result Screen
- Purpose: compare 3 generated patterns.
- API: `POST /menu/generate`.
- Main response fields:
  - `patterns[].slots`
  - `patterns[].nutrition_summary`
  - `patterns[].constraint_evaluation`
  - `patterns[].applied_conditions`
  - `patterns[].generation_note`
- UI usage:
  - pattern cards with kcal/protein gaps
  - show applied condition chips
  - show explanation note per pattern
- Error handling:
  - `NO_RECIPES_FOUND`: show condition-relax suggestions.
- Notes:
  - when `constraint_relaxed=true`, show explicit disclaimer banner.

### 6) Error Display State
- Purpose: consistent user + developer handling.
- API: all endpoints.
- Main response fields: `error_code`, `detail`.
- UI usage:
  - branch by `error_code`, display friendly message, keep technical details in logs.
- Notes:
  - do not branch on free-text `detail`.

### 7) Future Screens (Favorites / History / Meal Logs)
- Purpose: readiness planning.
- API today: reference-only.
- Notes:
  - keep local state schema based on existing `recipe_id` and menu pattern structure.
  - use current error handling contract for future API additions.

## Initial Load Strategy
- Call `/meta/options` at app start and cache.
- Recommended cache policy:
  - memory cache for current session
  - persisted cache for cold start fallback
  - background refresh on app resume
- UI rule:
  - render `label_ja`, submit `code`
- Strict-mode future readiness:
  - never submit labels as source of truth
  - centralize option mapping in one frontend module

## Common Integration Rules
- Always handle non-200 with `{ error_code, detail }`.
- Treat `/recipes` 0 results as normal UX path.
- Keep pagination state from server values.
- Prefer resilient UI wording over technical jargon.

## Quick Request Examples

### List
```http
GET /recipes?category=main&meal_type=post_game&limit=20&offset=0
```

### Detail
```http
GET /recipes/MAIN_BEEF_001
```

### Menu
```json
POST /menu/generate
{
  "target_kcal": 800,
  "target_protein_g": 35,
  "scene": "post_game",
  "meal_type": "snack",
  "include_dessert": true
}
```

## Related Docs
- `docs/api_menu_mvp_spec.md`
- `docs/api_vocabulary_guide.md`
- `docs/error_ui_mapping_guide.md`
- `docs/frontend_common_api_handler_guide.md`
- `docs/ui_component_api_mapping.md`
