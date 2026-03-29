# Excel Canonical命名と内部変換ポリシー（正式）

- 文書ID: `REC-EXCEL-NAMING-TRANS-POLICY`
- 版数: `v1.0.0`
- 最終更新日: `2026-03-22`

## 1. 目的
Excel作成時の可読性と、Python/DB/API実装時の保守性を両立するため、命名規則と変換責務を固定する。

## 2. 正式採用ルール
- Excel: Canonical Header Case（例: `Recipe_ID`）
- Python: `snake_case`
- DB: `snake_case`
- API JSON: `snake_case`

## 3. 変換フロー
1. Excel読込直後に Canonical -> snake_case 変換
2. DB投入・内部処理・API返却は snake_case 固定
3. Excel再出力時のみ snake_case -> Canonical 逆変換

## 4. 変換マップ（主要）

| Canonical | Internal snake_case | DB Column | API JSON Key |
|---|---|---|---|
| `Recipe_ID` | `recipe_id` | `recipe_id` | `recipe_id` |
| `Recipe_Name` | `recipe_name` | `recipe_name` | `recipe_name` |
| `Category` | `category` | `category_lv1` | `category_lv1` |
| `Subcategory` | `subcategory` | `category_lv2` | `category_lv2` |
| `Ingredient_No` | `ingredient_no` | `line_no` | `line_no` |
| `Ingredient_Name` | `ingredient_name` | `ingredient_name` | `ingredient_name` |
| `Gross_Weight_g` | `gross_weight_g` | `gross_weight_g`(ext) | `gross_weight_g`(v2想定) |
| `Net_Weight_g` | `net_weight_g` | `weight_g` | `weight_g` |
| `Step_No` | `step_no` | `step_number` | `step_number` |
| `Step_Text` | `step_text` | `instruction` | `instruction` |
| `Is_Active` | `is_active` | `is_active`(ext) | `is_active`(v2想定) |

## 5. 実装原則
- 変換辞書は1か所で管理する。
- 変換辞書の変更は仕様書と同時更新する。
- 列名エイリアス吸収は行わない。
- 旧形式Excelは変換ツールで正規化してから検証する。

## 6. convert_legacy_recipe_excel.py 雛形要件
- 入力: 旧シート/旧列名Excel
- 出力: Canonicalシート/Canonical列名Excel
- 処理:
  - シート名置換（`Recipe_Master` -> `Recipes`）
  - 列名置換（例: `Weight(g)` -> `Net_Weight_g`）
  - 不足必須列の補完（空欄/既定値）
  - 変換ログ出力（置換件数・警告件数）
