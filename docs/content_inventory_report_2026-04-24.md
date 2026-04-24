# Content Inventory Report

- Report date: 2026-04-24
- Purpose: identify current recipe content coverage and the next content-building tasks.
- Scope:
  - Git-tracked source corpus: `data/generated/recipe_db_*.xlsx`
  - current integrated artifact: `output/integrated/*`
  - category mapping: `master/category_master.csv`

# 1. Source Set
Decision:
- `data/generated/*.xlsx` is the source-of-truth location for recipe source workbooks that should be integrated into GitHub.
- Root-level `recipe_db_*.xlsx` files remain ignored as working/legacy copies.
- `output/integrated/*` remains a generated artifact and is not the Git source of truth.

`data/generated` now contains 14 active source files.

Excluded from the active unique set:
- `recipe_db_gohan_120.xlsx`: superseded by `recipe_db_gohan_120_fixed.xlsx`
- `recipe_db_main_beef_batch1.xlsx`: duplicate of the `_100_batch1` file
- `recipe_db_main_chicken_batch1.xlsx`: duplicate of the `_100_batch1` file
- `recipe_db_main_pork_batch1.xlsx`: duplicate of the `_100_batch1` file
- `recipe_db_main_seafood_batch1.xlsx`: duplicate of the `_100_batch1` file

Active unique source files:
- `recipe_db_bread_100.xlsx`
- `recipe_db_dessert_100_batch1.xlsx`
- `recipe_db_donburi_100_batch1.xlsx`
- `recipe_db_gohan_120_fixed.xlsx`
- `recipe_db_main_beef_100_batch1.xlsx`
- `recipe_db_main_chicken_100_batch1.xlsx`
- `recipe_db_main_pork_100_batch1.xlsx`
- `recipe_db_main_seafood_100_batch1.xlsx`
- `recipe_db_ramen_50.xlsx`
- `recipe_db_side_lowprotein_100_batch1.xlsx`
- `recipe_db_side_protein5_100_batch1.xlsx`
- `recipe_db_soba_50.xlsx`
- `recipe_db_soup_100_batch1.xlsx`
- `recipe_db_udon_100.xlsx`

# 2. Root Workbook Corpus Summary
| Metric | Count |
|---|---:|
| active source files | 14 |
| recipes | 1,320 |
| ingredient rows | 9,589 |
| step rows | 4,980 |
| duplicate recipe IDs | 0 |
| duplicate recipe names | 0 |

Slot coverage inferred from file names:

| Slot | Recipes |
|---|---:|
| staple | 520 |
| main | 400 |
| side | 200 |
| soup | 100 |
| dessert | 100 |

This corpus is broad enough for the current `staple + main + side + soup (+ dessert)` menu generator, assuming these files are included in the active import path.

# 3. Completeness Summary
| Field group | Missing count | Denominator | Missing rate |
|---|---:|---:|---:|
| recipe_id | 0 | 1,320 | 0.0% |
| recipe_name | 0 | 1,320 | 0.0% |
| energy_kcal | 0 | 1,320 | 0.0% |
| protein_g | 0 | 1,320 | 0.0% |
| fat_g | 0 | 1,320 | 0.0% |
| carbohydrate_g | 0 | 1,320 | 0.0% |
| tags | 10 | 1,320 | 0.8% |
| cooking_method | 0 | 1,320 | 0.0% |
| notes | 0 | 1,320 | 0.0% |
| ingredient_name | 0 | 9,589 | 0.0% |
| ingredient weight | 0 | 9,589 | 0.0% |
| step instruction | 0 | 4,980 | 0.0% |

The only direct missing-content issue found in the active source set is 10 blank tag cells in `recipe_db_main_seafood_100_batch1.xlsx`.

Blank tag recipes:
- `MAIN_SEAFOOD_001`
- `MAIN_SEAFOOD_011`
- `MAIN_SEAFOOD_015`
- `MAIN_SEAFOOD_020`
- `MAIN_SEAFOOD_026`
- `MAIN_SEAFOOD_033`
- `MAIN_SEAFOOD_057`
- `MAIN_SEAFOOD_073`
- `MAIN_SEAFOOD_093`
- `MAIN_SEAFOOD_095`

# 4. Per-File Counts
| File | Slot | Recipes | Ingredients | Steps | Tag blanks |
|---|---|---:|---:|---:|---:|
| `recipe_db_bread_100.xlsx` | staple | 100 | 580 | 400 | 0 |
| `recipe_db_dessert_100_batch1.xlsx` | dessert | 100 | 500 | 300 | 0 |
| `recipe_db_donburi_100_batch1.xlsx` | staple | 100 | 690 | 400 | 0 |
| `recipe_db_gohan_120_fixed.xlsx` | staple | 120 | 811 | 480 | 0 |
| `recipe_db_main_beef_100_batch1.xlsx` | main | 100 | 883 | 400 | 0 |
| `recipe_db_main_chicken_100_batch1.xlsx` | main | 100 | 883 | 400 | 0 |
| `recipe_db_main_pork_100_batch1.xlsx` | main | 100 | 883 | 400 | 0 |
| `recipe_db_main_seafood_100_batch1.xlsx` | main | 100 | 883 | 400 | 10 |
| `recipe_db_ramen_50.xlsx` | staple | 50 | 421 | 200 | 0 |
| `recipe_db_side_lowprotein_100_batch1.xlsx` | side | 100 | 520 | 300 | 0 |
| `recipe_db_side_protein5_100_batch1.xlsx` | side | 100 | 540 | 300 | 0 |
| `recipe_db_soba_50.xlsx` | staple | 50 | 385 | 200 | 0 |
| `recipe_db_soup_100_batch1.xlsx` | soup | 100 | 510 | 300 | 0 |
| `recipe_db_udon_100.xlsx` | staple | 100 | 1,100 | 500 | 0 |

# 5. Tag Findings
Top observed tag values in the active source set:
- `高たんぱく`: 733
- `低脂質`: 686
- `増量期`: 352
- `試合前`: 330
- `高炭水化物`: 288
- `試合後`: 273
- `減量期`: 252
- `汁物`: 100
- `カルシウム補給`: 99
- `主菜化回避`: 94

Normalization issue:
- `recipe_db_gohan_120_fixed.xlsx` has 120 rows where tags are slash-separated, for example `高たんぱく / 低脂質 / 高炭水化物`.
- Other workbooks mainly use comma-separated tags.
- Because API search currently performs partial matching on `tags`, this does not block basic behavior, but it weakens tag vocabulary consistency and reporting.

# 6. Current Integrated Artifact
After rebuilding integration from `data/generated`, `output/integrated` contains:

| Metric | Count |
|---|---:|
| recipes | 1,320 |
| ingredient rows | 9,589 |
| step rows | 4,980 |
| integrated source files | 14 |
| rejected source files | 0 |
| duplicated recipe IDs | 0 |

Integrated source distribution:

| Source file | Recipes |
|---|---:|
| `recipe_db_bread_100.xlsx` | 100 |
| `recipe_db_dessert_100_batch1.xlsx` | 100 |
| `recipe_db_donburi_100_batch1.xlsx` | 100 |
| `recipe_db_gohan_120_fixed.xlsx` | 120 |
| `recipe_db_main_beef_100_batch1.xlsx` | 100 |
| `recipe_db_main_chicken_100_batch1.xlsx` | 100 |
| `recipe_db_main_pork_100_batch1.xlsx` | 100 |
| `recipe_db_main_seafood_100_batch1.xlsx` | 100 |
| `recipe_db_ramen_50.xlsx` | 50 |
| `recipe_db_side_lowprotein_100_batch1.xlsx` | 100 |
| `recipe_db_side_protein5_100_batch1.xlsx` | 100 |
| `recipe_db_soba_50.xlsx` | 50 |
| `recipe_db_soup_100_batch1.xlsx` | 100 |
| `recipe_db_udon_100.xlsx` | 100 |

Integrated category distribution:

| category_lv1 | Recipes |
|---|---:|
| `主食` | 420 |
| `丼` | 100 |
| `主菜` | 400 |
| `副菜` | 200 |
| `汁物` | 100 |
| `デザート` | 100 |

Completeness in `output/integrated` is good for the 1,320 included recipes: recipe IDs, names, nutrition, tags, methods, notes, ingredient names, weights, and step instructions all have 0 missing values in the current artifact.

# 7. Completed Decisions And Fixes
Completed:
- `data/generated` was selected as the GitHub-integrated source data directory.
- `.gitignore` was updated so `data/generated/*.xlsx` can be tracked while other generated data remains ignored.
- The 14 active workbooks were copied into `data/generated`.
- `recipe_db_main_seafood_100_batch1.xlsx` blank tags were filled with conservative category fallback tags where nutrition-derived tags were not available.
- `recipe_db_gohan_120_fixed.xlsx` slash-separated tags were normalized.
- `scripts/validation/run_all_validations.py` now validates all 14 active source files.
- Validation result: 14 passed / 0 manual_review / 0 failed.
- `master/category_master.csv` now includes `recipe_db_gohan_*.xlsx` as `主食 / ごはん`.
- `scripts/integration/build_integrated_recipe_db.py` accepts `Step_No` / `Step_Description` compatibility columns for legacy-like source sheets.
- Integration result: 14 integrated / 0 rejected / 1,320 recipes.
- The rebuilt integrated CSVs were loaded into PostgreSQL at `localhost:5432/recipe_app`.
- DB load result: 1,320 recipes / 9,589 ingredient rows / 4,980 step rows, all matching the integrated CSV row counts.
- The API staple slot condition now treats `丼` and `DON_` IDs as staple-compatible.
- Full-corpus slot availability after the fix:
  - staple / donburi: 520 recipes
  - main: 400 recipes
  - side: 200 recipes
  - soup: 100 recipes
  - dessert: 100 recipes
- `POST /menu/generate` smoke checks returned 200 with 3 patterns, including a real `DON_` recipe in the staple slot.
- `npm run test:e2e:full-corpus` verifies the Next.js -> FastAPI -> PostgreSQL browser flow against the full local corpus.
- Full-corpus E2E result: 3 passed.
- Docker PostgreSQL now uses host port `5432`.
- The Docker-backed `recipe_test_db` at `127.0.0.1:5432` was loaded with the full corpus: 1,320 recipes / 9,589 ingredient rows / 4,980 step rows.
- Standard E2E result after the port correction: `npm run test:e2e:result` passed 3/3.

# 8. Remaining Tasks
1. Add or confirm representative smoke cases for `meal_type` and `scene` combinations beyond the two API-level checks already run.
2. Decide whether the current MVP needs content fields not yet exposed by the API:
   - `cooking_time_min`
   - allergen/exclusion metadata
   - budget/cook-time filtering metadata
3. `amount_value` / `unit` are now exposed in recipe detail for canonical ingredient amount display.

# 9. Recommended Immediate Order
1. Commit the Git-tracked source data, ETL/validation changes, DB smoke fix, and updated docs.
2. Open a draft PR so the source workbooks, validation path, integration path, DB smoke fix, and full-corpus E2E path are reviewed together.
3. After this PR, continue with fields such as `cooking_time_min`, allergen/exclusion metadata, or budget/cook-time filtering metadata.
