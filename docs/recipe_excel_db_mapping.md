# レシピExcel -> DB/API マッピング仕様（Canonical v1.1.0）

- 参照元: `docs/recipe_excel_canonical_format_spec.md`
- 目的: 命名規則と変換責務の固定

## 1. 正式命名規則
- Excel列名: Canonical Header Case（例: `Recipe_ID`）
- Python内部: `snake_case`（例: `recipe_id`）
- DBカラム: `snake_case`（例: `recipe_id`）
- API JSONキー: `snake_case`（例: `recipe_id`）

## 2. 変換責務（正式）
1. Excel読込: Canonical -> snake_case
2. 検証: Canonical列名ベースで実施
3. 内部処理/DB投入: snake_caseのまま
4. API返却: snake_caseのまま
5. Excel再出力時のみ snake_case -> Canonical

## 3. テーブルマッピング
- `Recipes` -> `public.recipes`
- `Ingredients` -> `public.recipe_ingredients`
- `Steps` -> `public.recipe_steps`
- `Tags` / `*_Tag_List` -> `public.recipe_tags`（推奨）
- `Nutrition_Summary` -> `public.recipe_nutrition`（推奨）

## 4. 主キー/一意キー
- `recipes`: `recipe_id` PK
- `recipe_ingredients`: `(recipe_id, line_no)` UNIQUE
- `recipe_steps`: `(recipe_id, step_number)` UNIQUE

## 5. UPSERT方針
- `recipes`: `ON CONFLICT(recipe_id) DO UPDATE`
- `recipe_ingredients`: `ON CONFLICT(recipe_id, line_no) DO UPDATE`
- `recipe_steps`: `ON CONFLICT(recipe_id, step_number) DO UPDATE`

## 6. 変換テーブル（抜粋）

| Excel Canonical | Python/DB/API snake_case |
|---|---|
| `Recipe_ID` | `recipe_id` |
| `Recipe_Name` | `recipe_name` |
| `Ingredient_No` | `ingredient_no` -> DB投入時 `line_no` |
| `Ingredient_Name` | `ingredient_name` |
| `Gross_Weight_g` | `gross_weight_g` |
| `Net_Weight_g` | `net_weight_g` -> DB投入時 `weight_g` |
| `Step_No` | `step_no` -> DB投入時 `step_number` |
| `Step_Text` | `step_text` -> DB投入時 `instruction` |
| `Is_Active` | `is_active` |
| `Energy_kcal` | `energy_kcal` |
| `Protein_g` | `protein_g` |
| `Fat_g` | `fat_g` |
| `Carbohydrate_g` | `carbohydrate_g` |

## 7. DB/API差分吸収ポリシー
- DB互換のため以下はDB既存列にマップする
  - `ingredient_no` -> `line_no`
  - `step_no` -> `step_number`
  - `step_text` -> `instruction`
  - `net_weight_g` -> `weight_g`
- APIレスポンスは既存互換を優先し `line_no`, `step_number`, `instruction`, `weight_g` を返し、Canonicalの表示量として `amount_value`, `unit` も返す
- 将来v2 APIで `ingredient_no` / `step_no` 併記を検討

## 8. 実装メモ
- 変換辞書を単一モジュールで管理（例: `excel_column_map.py`）
- `validate_recipe_excel.py` とローダーで同じ辞書を共有
- 変換辞書は双方向（Canonical->snake_case / snake_case->Canonical）を持つ
