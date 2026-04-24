# MVP Requirements Draft

- Last synchronized: 2026-04-24
- Implementation sources: `src/app/**`, `app_api/app/**`
- Related specs: `docs/api_contract_mvp.md`, `docs/screen_io_specification_mvp.md`

# 1. Purpose
This document fixes the current MVP scope for the meal planning application.

The MVP verifies whether a user can:
1. enter and save a profile,
2. generate menu patterns from target kcal/protein and simple context,
3. compare generated menu patterns,
4. open recipe details and judge whether the recipe is usable.

# 2. Value Hypothesis
- A user can get realistic menu candidates from actual recipe data without manual recipe browsing.
- Kcal/protein gaps and generated notes are enough for an initial adoption decision.
- Recipe detail pages provide enough ingredients, steps, and nutrition data to judge whether the menu can be cooked.

# 3. Target User
- Primary user: guardian / household meal planner.
- Usage context: choosing practical meals for a child or family member around training, daily meals, recovery, or performance goals.
- Required knowledge level: no professional nutrition knowledge assumed.

# 4. Current MVP Scope
## Included Screens
| Route | Purpose |
|---|---|
| `/profile` | profile input and validation |
| `/generate` | menu condition input and menu generation |
| `/result` | generated menu pattern comparison |
| `/recipes/[recipeId]` | recipe detail |

## Included APIs
| API | Purpose |
|---|---|
| `POST /api/users/profile` | profile validation |
| `GET /api/meta/options` | vocabulary options |
| `POST /api/menu/generate` | menu generation |
| `GET /api/recipes/{recipeId}` | recipe detail proxy |
| `GET /api/recipes/search` | recipe search proxy |
| `GET /meta/options` | FastAPI vocabulary options |
| `POST /menu/generate` | FastAPI menu generation |
| `GET /recipes` | FastAPI recipe list |
| `GET /recipes/{recipe_id}` | FastAPI recipe detail |

# 5. Required Features
- Profile form validation and local persistence.
- Target kcal/protein derivation from profile.
- Editable target kcal/protein on the generation screen.
- Meal timing and scene selectors driven by `/meta/options`, with frontend fallback options.
- Optional dessert toggle.
- Menu generation returning up to 3 patterns.
- Result screen showing slots, total kcal/protein, kcal/protein gaps, condition evaluation, and generation note.
- Recipe detail screen showing name, categories, tags, notes, ingredients, steps, and nutrition.
- Error states for profile validation, options fetch failure, menu generation failure, missing result data, and recipe detail fetch failure.

# 6. Out of Scope
- login / membership
- billing
- external integrations
- AI chat
- favorites
- history
- comparison beyond current 3 pattern selector
- sharing
- PDF export
- shopping list
- server-side condition saving
- weekly menu planning
- automatic optimization beyond the current rule-based generator
- advanced recommendation reasons
- strict medical or diagnostic nutrition calculation

# 7. Profile Input Requirements
Current profile fields:
- age
- sex
- height_cm
- weight_kg
- optional body_fat_percent
- sport
- activity_level
- goal_type
- likes[]
- dislikes[]
- allergies[]
- family_size
- cook_time_breakfast_min
- cook_time_dinner_min
- budget_per_meal_jpy

Current behavior:
- profile validation is handled by `POST /api/users/profile`
- accepted profile is saved to `localStorage` as `kondate_profile`
- likes/dislikes/allergies and cook-time preferences are captured but not yet applied to `POST /menu/generate`

# 8. Menu Generation Requirements
Input sent to the menu API:
- `target_kcal`
- `target_protein_g`
- `meal_type`
- `scene`
- `include_dessert`

Generation behavior:
- required slots: staple, main, side, soup
- optional slot: dessert
- return target: 3 patterns when enough candidates exist
- kcal fit: target kcal plus/minus 20%
- protein fit: target protein as lower bound
- if strict context filters are too narrow, the service may relax constraints and expose that through `constraint_evaluation.constraint_relaxed`

Not currently implemented:
- `cooking_load`
- `exclude_ingredients`
- allergy exclusion
- dislike exclusion
- budget filtering
- cook-time filtering

# 9. Result Requirements
The result screen must show:
- generation conditions
- selectable patterns
- slot-level recipe names and categories
- kcal/protein per slot
- total kcal/protein per pattern
- kcal/protein target vs actual gap
- match level and constraint-relaxation state
- generation note
- link to each recipe detail

If no result is stored locally, the screen must guide the user back to `/generate`.

# 10. Recipe Detail Requirements
The detail screen must show:
- recipe name
- category chips
- tag chips when present
- cooking method when present
- notes when present
- ingredients
- steps
- energy, protein, fat, carbohydrate

Current display fallback:
- missing ingredient weight: "量未登録"
- empty ingredients: "材料情報はまだ登録されていません。"
- empty steps: "手順情報はまだ登録されていません。"
- fetch failure: error panel with link back to `/result`

# 11. Content Sufficiency Requirements
The content corpus must support menu generation across the required slots:
- staple
- main
- side
- soup
- dessert, if `include_dessert=true`

Minimum useful recipe data:
- `recipe_id`
- `recipe_name`
- category or recipe-id prefix sufficient for slot inference
- energy/protein/fat/carbohydrate
- tags
- cooking_method
- notes
- ingredient rows
- step rows

Current known gaps are tracked in `docs/content_inventory_report_2026-04-24.md`.

# 12. Completion Criteria
MVP is considered usable when:
- profile save succeeds with valid input,
- menu generation returns at least one pattern for representative conditions,
- result screen shows generated patterns from real data,
- recipe detail can be opened from result recipes,
- detail screen contains ingredients, steps, and nutrition,
- known no-result/API-failure states are visible and recoverable,
- content coverage includes staple/main/side/soup for the active import path.
