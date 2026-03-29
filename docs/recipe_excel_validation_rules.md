# レシピExcel 検証ルール仕様（Canonical v1.1.0）

- 参照元: `docs/recipe_excel_canonical_format_spec.md`
- 実装対象: `validate_recipe_excel.py`
- 検証基準: **Excel Canonical列名ベース**（内部snake_caseでは判定しない）

## 1. 判定レベル
- `ERROR`: 投入禁止
- `WARN`: 投入可（要確認）

## 2. 検証順序（固定）
1. 必須シート存在
2. 列名完全一致
3. 必須列の欠落
4. 行データ型
5. ID/参照整合性
6. 業務ルール

## 3. 必須シート
- `Recipes`
- `Ingredients`
- `Steps`

## 4. 必須列（Canonical列名で完全一致）
## 4.1 Recipes
- `Recipe_ID`
- `Recipe_Name`
- `Category`
- `Subcategory`
- `Serving_Size`
- `Yield_Flag`
- `Retention_Flag`
- `Total_Time_Min`
- `Version`
- `Is_Active`
- `Energy_kcal`
- `Protein_g`
- `Fat_g`
- `Carbohydrate_g`

## 4.2 Ingredients
- `Recipe_ID`
- `Ingredient_No`
- `Ingredient_Name`
- `Amount`
- `Unit`
- `Net_Weight_g`
- `Optional_Flag`

## 4.3 Steps
- `Recipe_ID`
- `Step_No`
- `Step_Text`

## 5. Rule一覧

| Rule_ID | Level | 条件 |
|---|---|---|
| E001_MISSING_SHEET | ERROR | 必須シート欠落 |
| E002_INVALID_SHEET_NAME | ERROR | 旧名/別名シート使用 |
| E003_MISSING_REQUIRED_COLUMN | ERROR | 必須列欠落 |
| E004_COLUMN_NAME_NOT_EXACT | ERROR | 列名が完全一致しない |
| E005_DUP_RECIPE_ID | ERROR | `Recipes.Recipe_ID` 重複 |
| E006_INVALID_RECIPE_ID_FORMAT | ERROR | `Recipe_ID` 書式不正 |
| E007_INGREDIENT_NAME_REQUIRED | ERROR | `Ingredient_Name` 空欄/空文字/空白のみ |
| E008_STEP_TEXT_REQUIRED | ERROR | `Step_Text` 空欄/空文字/空白のみ |
| E009_INVALID_NUMERIC_TYPE | ERROR | 数値列に非数値 |
| E010_INVALID_FLAG_VALUE | ERROR | `_Flag` 列が `0/1` 以外 |
| E011_INVALID_UNIT | ERROR | `Unit` が許容一覧外 |
| E012_ING_FK_RECIPE_NOT_FOUND | ERROR | `Ingredients.Recipe_ID` 参照不整合 |
| E013_STEP_FK_RECIPE_NOT_FOUND | ERROR | `Steps.Recipe_ID` 参照不整合 |
| E014_DUP_INGREDIENT_NO | ERROR | `(Recipe_ID, Ingredient_No)` 重複 |
| E015_DUP_STEP_NO | ERROR | `(Recipe_ID, Step_No)` 重複 |
| E016_INGREDIENT_NO_NOT_SEQUENTIAL | ERROR | `Ingredient_No` 連番不正 |
| E017_STEP_NO_NOT_SEQUENTIAL | ERROR | `Step_No` 連番不正 |
| E018_INVALID_TAG_CODE | ERROR | タグ辞書にない値 |
| E019_EXCEL_ERROR_VALUE | ERROR | `#N/A/#VALUE!/#REF!/#DIV/0!/#NAME?/#NULL!/#NUM!` を含む |
| E020_EMPTY_STRING_NOT_ALLOWED | ERROR | 空文字 `""` または空白のみ文字列 |
| W001_FOOD_ID_EMPTY | WARN | `Food_ID` 未設定（空欄/NULL） |
| W002_TOTAL_TIME_INCONSISTENT | WARN | `Total_Time_Min < Prep_Time_Min + Cook_Time_Min` |

## 6. データ型チェック基準
- int列: 整数のみ
- decimal列: 実数のみ
- enum列: 許容値一覧に一致
- text/string列: `trim()` 後に空文字禁止（任意列で値がある場合）

## 7. 単位許容一覧
- `g`
- `kg`
- `ml`
- `L`
- `個`
- `枚`
- `本`
- `小さじ`
- `大さじ`
- `適量`

## 8. Food_ID 方針
- `Food_ID` は任意
- 未設定は `WARN`
- 値がある場合は `^F[0-9]{3,8}$` を満たすこと

## 9. 列名エイリアス方針
- 非採用（吸収しない）
- 旧フォーマットは `convert_legacy_recipe_excel.py` で事前変換してから検証する

## 10. 推奨関数分割（実装ヒント）
- `load_workbook_sheets()`
- `validate_required_sheets()`
- `validate_exact_columns()`
- `validate_scalar_types()`
- `validate_recipe_ids()`
- `validate_ingredient_rows()`
- `validate_step_rows()`
- `validate_tag_values()`
- `validate_excel_error_tokens()`
- `build_validation_report()`

## 11. 出力JSON雛形
```json
{
  "status": "failed",
  "errors": [{"rule_id": "E007_INGREDIENT_NAME_REQUIRED", "sheet": "Ingredients", "row": 12}],
  "warnings": [{"rule_id": "W001_FOOD_ID_EMPTY", "sheet": "Ingredients", "row": 14}],
  "summary": {"error_count": 1, "warning_count": 1}
}
```
