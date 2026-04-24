# Screen I/O Specification MVP

- Last synchronized: 2026-04-24
- Implementation sources: `src/app/profile/page.tsx`, `src/app/generate/page.tsx`, `src/app/result/page.tsx`, `src/app/recipes/[recipeId]/page.tsx`, `src/types/api.ts`
- API contract: `docs/api_contract_mvp.md`

# 1. Purpose
This document describes the current MVP screen inputs, outputs, state, and API usage.

The current implementation has 4 user-facing screens:
- `/profile`
- `/generate`
- `/result`
- `/recipes/[recipeId]`

The earlier 3-screen draft treated condition input and profile input as one screen. In the current implementation, profile values are saved first, then menu generation uses derived target kcal/protein values.

# 2. Screen List
| Screen ID | Route | Name | Main purpose |
|---|---|---|---|
| SCR-01 | `/profile` | Profile input | Validate and save user profile in browser local storage |
| SCR-02 | `/generate` | Menu condition input | Derive target nutrition values, choose meal/scene, and call menu generation |
| SCR-03 | `/result` | Menu result | Compare generated menu patterns and open recipe details |
| SCR-04 | `/recipes/[recipeId]` | Recipe detail | Show ingredients, steps, nutrition, tags, and notes for one recipe |

# 3. Navigation
| From | To | Trigger | State passed |
|---|---|---|---|
| `/profile` | `/generate` | "生成画面へ" button | Profile is stored in `localStorage` as `kondate_profile` |
| `/generate` | `/result` | successful `POST /api/menu/generate` | Menu result is stored in `localStorage` as `kondate_result` |
| `/result` | `/recipes/[recipeId]` | recipe link click | `recipe_id` in the URL |
| `/recipes/[recipeId]` | `/result` | back link | Result page reloads `kondate_result` from local storage |

The current result page opens recipe detail links with `target="_blank"`.

# 4. SCR-01 Profile Input
## Input Fields
| UI field | Type | Required | Stored field |
|---|---|---|---|
| age | number | yes | `age` |
| sex | enum | yes | `sex` |
| sport | string | yes | `sport` |
| height | number | yes | `height_cm` |
| weight | number | yes | `weight_kg` |
| body fat percent | number | no | `body_fat_percent` |
| family size | number | yes | `family_size` |
| activity level | enum | yes | `activity_level` |
| goal type | enum | yes | `goal_type` |
| budget per meal | number | yes | `budget_per_meal_jpy` |
| breakfast cook time | number | yes | `cook_time_breakfast_min` |
| dinner cook time | number | yes | `cook_time_dinner_min` |
| likes | comma-separated text | no | `likes[]` |
| dislikes | comma-separated text | no | `dislikes[]` |
| allergies | comma-separated text | no | `allergies[]` |

## API Usage
- `POST /api/users/profile`

Success:
- save the profile to `localStorage`
- show a saved message

Failure:
- show "入力値にエラーがあります"
- do not overwrite saved profile

## Notes
- `body_fat_percent` is present in the current UI as an optional field.
- Likes, dislikes, and allergies are collected but are not yet sent to `POST /menu/generate`.

# 5. SCR-02 Menu Condition Input
## Inputs
| UI field | Type | Source | Sent to API |
|---|---|---|---|
| target energy | number | derived from profile, editable | `target_kcal` |
| target protein | number | derived from profile, editable | `target_protein_g` |
| meal timing | select | `GET /api/meta/options` or fallback constants | `meal_type` |
| scene | select | `GET /api/meta/options` or fallback constants | `scene` |
| include dessert | checkbox | local default `true` | `include_dessert` |

## API Usage
- `GET /api/meta/options`
- `POST /api/menu/generate`

The generation request body is:

```json
{
  "target_kcal": 800,
  "target_protein_g": 35,
  "meal_type": "dinner",
  "scene": "post_game",
  "include_dessert": true
}
```

## Normal State
- Load saved profile from `kondate_profile`; if absent, use `defaultProfile`.
- Calculate initial `target_kcal` and `target_protein_g`.
- Load vocabulary options.
- On success, save the response to `kondate_result` and navigate to `/result`.

## Error State
| Condition | UI behavior |
|---|---|
| options API failure | show warning and use fallback options |
| `VALIDATION_ERROR` | show input check message |
| `INVALID_PARAMETER` | show condition review message |
| `NO_RECIPES_FOUND` | show no-candidate message |
| `MENU_GENERATION_FAILED` | show retry/relax condition message |
| `APP_API_UNAVAILABLE` | show backend connection message |

## Current Limitations
- `cooking_load` is not implemented.
- `exclude_ingredients` is not implemented.
- Profile likes/dislikes/allergies are not applied to menu generation yet.

# 6. SCR-03 Menu Result
## Input Source
- `localStorage` key: `kondate_result`

## Display Fields
| Area | Source fields |
|---|---|
| generation conditions | `request.meal_type_label`, `request.scene_label`, `request.target_kcal`, `request.target_protein_g`, `request.include_dessert` |
| pattern selector | `patterns[].pattern_no`, `patterns[].total_kcal`, `patterns[].total_protein_g` |
| slot list | `patterns[].slots[].slot`, `recipe.recipe_id`, `recipe.recipe_name`, category fields, kcal, protein, tags |
| nutrition summary | `nutrition_summary.target_*`, `nutrition_summary.actual_*`, `nutrition_summary.*_gap` |
| fit state | `constraint_evaluation.*`, `within_kcal_range`, `protein_target_met` |
| generation note | `generation_note`, `applied_conditions.*` |

## Normal State
- Show pattern selector.
- Show the selected pattern's slots.
- Recipe names link to `/recipes/{recipe_id}`.

## Empty State
- If `kondate_result` is missing or unreadable, show "結果データがありません。先に献立を生成してください。" and link to `/generate`.

## Current Limitations
- Result history is not persisted server-side.
- Pattern comparison is limited to kcal/protein and existing explanation fields.
- There is no direct condition-edit retry shortcut yet.

# 7. SCR-04 Recipe Detail
## Input
| Input | Source |
|---|---|
| `recipeId` | URL parameter |

## API Usage
- Server component calls FastAPI detail through `fetchAppApi("/recipes/{recipeId}")`.
- Next.js proxy route `GET /api/recipes/{recipeId}` also exists for client/API consumers.

## Display Fields
| UI area | API fields |
|---|---|
| title | `recipe_name` |
| category chips | `category_lv1`, `category_lv2`, `category_lv3` |
| tag chips | `tags` split by comma or pipe |
| cooking method | `cooking_method` |
| notes | `notes` |
| ingredients | `ingredients[].ingredient_name`, `ingredient_alias`, `amount_value`, `unit`, `weight_g` |
| steps | `steps[].step_number`, `instruction` |
| nutrition | `energy_kcal`, `protein_g`, `fat_g`, `carbohydrate_g` |

## Normal State
- Show recipe header, materials, steps, nutrition, and back link to `/result`.

## Error State
| Condition | UI behavior |
|---|---|
| `404 RECIPE_NOT_FOUND` | render Next.js `notFound()` |
| FastAPI/proxy failure | show detail acquisition failure panel and link back to `/result` |
| ingredients empty | show "材料情報はまだ登録されていません。" |
| steps empty | show "手順情報はまだ登録されていません。" |
| missing weight | show "量未登録" |

# 8. Field Availability Matrix
| MVP display need | Current field | Status |
|---|---|---|
| recipe identifier | `recipe_id` | available |
| recipe name | `recipe_name` | available |
| category / slot | category fields plus slot inference in service | available |
| tags / purpose hints | `tags` | available as string |
| notes / explanation | `notes`, `generation_note` | available |
| kcal | `energy_kcal` | available |
| protein | `protein_g` | available |
| fat | `fat_g` | available |
| carbohydrate | `carbohydrate_g` | available |
| ingredients | `ingredients[]` | available |
| ingredient amount | `amount_value` / `unit`, fallback `weight_g` | available |
| steps | `steps[]` | available |
| cooking time | none | not available |
| cooking load filter | none | not implemented |
| excluded ingredients | none | not implemented |

# 9. Next Implementation Candidates
1. Add condition-edit/retry flow from `/result` back to `/generate`.
2. Decide whether `likes`, `dislikes`, and `allergies` should feed into menu generation.
3. Decide whether `cooking_load` and `exclude_ingredients` belong in the current MVP API.
4. Add or derive `cooking_time_min` if cooking burden must be visible in MVP.

# 10. Related Docs
- `docs/api_contract_mvp.md`
- `docs/frontend_api_integration_guide.md`
- `docs/ui_component_api_mapping.md`
- `docs/error_ui_mapping_guide.md`
