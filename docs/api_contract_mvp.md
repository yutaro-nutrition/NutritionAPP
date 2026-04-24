# API Contract MVP

- Last synchronized: 2026-04-24
- Implementation sources: `app_api/app/api/routes/*.py`, `app_api/app/schemas/recipe_api.py`, `src/app/api/**/route.ts`, `src/types/api.ts`
- Scope: current MVP implementation contract, not the older pre-implementation `menu-candidates` draft.

# 1. Purpose
This document fixes the API contract used by the current MVP screens:
- profile validation
- menu condition input
- menu result
- recipe detail
- optional recipe search / browse

The current implementation does not expose `POST /api/v1/menu-candidates/search`. Menu creation is handled by `POST /menu/generate` on FastAPI and `POST /api/menu/generate` on Next.js.

# 2. Endpoint Summary
| Layer | Endpoint | Purpose |
|---|---|---|
| Next.js | `POST /api/users/profile` | Validate profile input before saving it to browser local storage |
| Next.js | `GET /api/meta/options` | Proxy to FastAPI vocabulary options |
| Next.js | `GET /api/recipes/search` | Proxy to FastAPI recipe list search |
| Next.js | `GET /api/recipes/{recipeId}` | Proxy to FastAPI recipe detail |
| Next.js | `POST /api/menu/generate` | Proxy to FastAPI menu generation |
| FastAPI | `GET /health` | API health check |
| FastAPI | `GET /meta/options` | Vocabulary options for fixed UI choices |
| FastAPI | `GET /recipes` | Recipe list search |
| FastAPI | `GET /recipes/{recipe_id}` | Recipe detail |
| FastAPI | `POST /menu/generate` | Rule-based menu generation |

Next.js proxy routes return the FastAPI payload unchanged when FastAPI succeeds. On connection failure, they return `502` with `APP_API_UNAVAILABLE`.

# 3. Common Error Shape
FastAPI error responses use:

```json
{
  "error_code": "RECIPE_NOT_FOUND",
  "detail": "Recipe not found: MAIN_001"
}
```

Current error codes:
- `RECIPE_NOT_FOUND`
- `INVALID_PARAMETER`
- `MENU_GENERATION_FAILED`
- `NO_RECIPES_FOUND`
- `VALIDATION_ERROR`
- `APP_API_UNAVAILABLE` on the Next.js proxy layer

Profile validation is the only exception. `POST /api/users/profile` returns `{ "ok": false, "error": ... }` on validation failure because it is a Next.js-local validator, not a FastAPI proxy.

# 4. `POST /api/users/profile`
## Purpose
Validate the profile form before storing it in `localStorage` under `kondate_profile`.

## Request Body
Uses `UserProfile`:

```json
{
  "age": 28,
  "sex": "male",
  "height_cm": 172,
  "weight_kg": 68,
  "body_fat_percent": 15,
  "sport": "ランニング",
  "activity_level": "moderate",
  "goal_type": "performance",
  "likes": ["鶏肉", "ご飯", "魚"],
  "dislikes": ["パクチー"],
  "allergies": ["えび"],
  "family_size": 2,
  "cook_time_breakfast_min": 15,
  "cook_time_dinner_min": 40,
  "budget_per_meal_jpy": 700
}
```

## Response
Success:

```json
{
  "ok": true,
  "profile": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": {}
}
```

# 5. `GET /meta/options`
## Purpose
Provide stable code values and Japanese labels for menu generation controls.

## Response
```json
{
  "meal_type": [
    { "code": "breakfast", "label_ja": "朝食", "aliases": [] }
  ],
  "scene": [
    { "code": "post_game", "label_ja": "試合後", "aliases": [] }
  ],
  "tags_recommended": {
    "performance_goal": ["high_protein"]
  },
  "notes": []
}
```

Current recommended `meal_type` codes:
- `breakfast`
- `lunch`
- `dinner`
- `snack`

Current recommended `scene` codes:
- `pre_game`
- `post_game`
- `bulking`
- `cutting`
- `recovery`
- `normal`

# 6. `POST /menu/generate`
## Purpose
Generate up to 3 menu patterns from target nutrition values and optional context.

## Request Body
```json
{
  "target_kcal": 800,
  "target_protein_g": 35,
  "meal_type": "dinner",
  "scene": "post_game",
  "include_dessert": true
}
```

Fields:
| Field | Required | Rule |
|---|---|---|
| `target_kcal` | yes | number, `> 0` |
| `target_protein_g` | yes | number, `>= 0` |
| `meal_type` | no | recommended code from `/meta/options`; aliases are accepted |
| `scene` | no | recommended code from `/meta/options`; aliases are accepted |
| `include_dessert` | no | boolean, default `true` |

The frontend derives `target_kcal` and `target_protein_g` from the saved profile, then lets the user adjust them on `/generate`. The API does not receive `age`, `sex`, `height_cm`, `weight_kg`, `cooking_load`, or `exclude_ingredients` in the current implementation.

## Response
```json
{
  "target_kcal": 800,
  "target_protein_g": 35,
  "meal_type": "dinner",
  "scene": "post_game",
  "patterns": [
    {
      "pattern_no": 1,
      "total_kcal": 812.5,
      "total_protein_g": 42.1,
      "kcal_min": 640,
      "kcal_max": 960,
      "protein_target_g": 35,
      "within_kcal_range": true,
      "protein_target_met": true,
      "nutrition_summary": {
        "target_kcal": 800,
        "actual_kcal": 812.5,
        "kcal_gap": 12.5,
        "target_protein_g": 35,
        "actual_protein_g": 42.1,
        "protein_gap": 7.1
      },
      "constraint_evaluation": {
        "kcal_match_level": "high",
        "protein_match_level": "high",
        "constraint_relaxed": false
      },
      "applied_conditions": {
        "scene": "post_game",
        "scene_normalized": "post_game",
        "meal_type": "dinner",
        "meal_type_normalized": "dinner",
        "include_dessert": true
      },
      "generation_note": "高タンパク質を優先した構成です",
      "slots": [
        {
          "slot": "main",
          "recipe": {
            "recipe_id": "MAIN_CHICKEN_001",
            "recipe_name": "鶏むねの照り焼き",
            "category_lv1": "主菜",
            "category_lv2": "鶏肉",
            "category_lv3": null,
            "tags": "高たんぱく, 試合後",
            "energy_kcal": 300,
            "protein_g": 30,
            "fat_g": 8,
            "carbohydrate_g": 15
          }
        }
      ]
    }
  ]
}
```

Slot values:
- `staple`
- `main`
- `side`
- `soup`
- `dessert`

Generation rules:
- required base composition is `staple + main + side + soup`
- dessert is optional
- kcal target range is `target_kcal * 0.8` through `target_kcal * 1.2`
- protein target is treated as a lower bound
- ranking prioritizes protein shortfall first, then kcal proximity
- if strict context filters produce empty slot pools, the service relaxes `meal_type` / `scene` in stages and reports `constraint_relaxed=true`

Errors:
| HTTP | Error code | Meaning |
|---|---|---|
| 400 | `INVALID_PARAMETER` | Slot or parameter issue |
| 404 | `NO_RECIPES_FOUND` | Required slot or protein target cannot be satisfied |
| 422 | `VALIDATION_ERROR` | Pydantic request validation error |

# 7. `GET /recipes`
## Purpose
Search recipe summaries. This is mainly for browse/search features and for proxy route `GET /api/recipes/search`.

## Query Parameters
| Parameter | Rule |
|---|---|
| `category` | optional category filter |
| `meal_type` | optional partial match against tags/notes |
| `tags` | optional comma-separated partial-match tags |
| `min_energy_kcal`, `max_energy_kcal` | optional nutrition range |
| `min_protein_g`, `max_protein_g` | optional nutrition range |
| `min_fat_g`, `max_fat_g` | optional nutrition range |
| `min_carbohydrate_g`, `max_carbohydrate_g` | optional nutrition range |
| `limit` | integer, `1..100`, default `20` |
| `offset` | integer, `>= 0`, default `0` |

## Response
```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "recipe_id": "MAIN_CHICKEN_001",
      "recipe_name": "鶏むねの照り焼き",
      "category_lv1": "主菜",
      "category_lv2": "鶏肉",
      "category_lv3": null,
      "tags": "高たんぱく, 試合後",
      "energy_kcal": 300,
      "protein_g": 30,
      "fat_g": 8,
      "carbohydrate_g": 15
    }
  ]
}
```

`total=0` and `items=[]` is a normal response, not an error.

# 8. `GET /recipes/{recipe_id}`
## Purpose
Fetch recipe detail for `/recipes/[recipeId]`.

## Response
```json
{
  "recipe_id": "MAIN_CHICKEN_001",
  "recipe_name": "鶏むねの照り焼き",
  "category_lv1": "主菜",
  "category_lv2": "鶏肉",
  "category_lv3": null,
  "tags": "高たんぱく, 試合後",
  "energy_kcal": 300,
  "protein_g": 30,
  "fat_g": 8,
  "carbohydrate_g": 15,
  "cooking_method": "焼く",
  "notes": "高タンパク質を優先",
  "ingredients": [
    {
      "line_no": 1,
      "ingredient_name": "鶏むね肉",
      "ingredient_alias": "鶏むね肉",
      "weight_g": 120,
      "notes": null
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "instruction": "材料を切る。"
    }
  ]
}
```

Important current limitations:
- detail response uses flat nutrition fields, not a nested `nutrition` object
- ingredient amount is exposed as `weight_g`; `amount_value` / `unit` are not exposed by the current API schema
- `cooking_time_min` is not exposed

Errors:
| HTTP | Error code | Meaning |
|---|---|---|
| 404 | `RECIPE_NOT_FOUND` | Recipe id is unknown |
| 422 | `VALIDATION_ERROR` | Request validation error |

# 9. Data Sufficiency Contract
For the current MVP, a menu result card needs:
- `recipe_id`
- `recipe_name`
- `category_lv1` / `category_lv2`
- `energy_kcal`
- `protein_g`
- optional `tags`

A detail page needs:
- `recipe_id`
- `recipe_name`
- `ingredients[]`
- `steps[]`
- `energy_kcal`
- `protein_g`
- `fat_g`
- `carbohydrate_g`

Optional or currently unavailable fields:
- `notes`: displayed when present
- `cooking_method`: displayed when present
- `cooking_time_min`: not present
- `exclude_ingredients`: not implemented in menu generation
- `cooking_load`: not implemented in menu generation

# 10. Related Docs
- `docs/api_menu_mvp_spec.md`
- `docs/frontend_api_integration_guide.md`
- `docs/screen_io_specification_mvp.md`
- `docs/error_ui_mapping_guide.md`
- `docs/api_vocabulary_guide.md`
