# レシピExcel 正式フォーマット仕様書（Canonical）

- 文書ID: `REC-EXCEL-CANONICAL-SPEC`
- 版数: `v1.1.0`
- 最終更新日: `2026-03-22`
- 本書の位置づけ: レシピExcel作成・検証・DB投入・API返却の正式基準

## 0. 正式採用方針（確定）
本プロジェクトは **案B** を正式採用する。

1. Excel層: Canonical列名（例: `Recipe_ID`）を使用する。
2. Python内部層: `snake_case` を使用する。
3. DB層: `snake_case` を使用する。
4. API JSON: `snake_case` を使用する。
5. 別名・エイリアス吸収は原則禁止。必要時は変換スクリプトで事前変換する。

## 1. 目的
- `Ingredient_Name` 欠落、`#N/A`、列名ブレ、再投入失敗を防止する。
- Excel作成者の視認性（Canonical列名）と実装者の保守性（snake_case）を両立する。
- `validate_recipe_excel.py` / DBローダー / FastAPI / UI の境界責務を固定する。

## 2. 適用範囲
対象カテゴリ（同一フォーマットで扱う）:
- ごはん
- うどん
- そば
- パスタ
- ラーメン
- パン
- 丼
- 主菜
- 副菜
- 汁物
- デザート
- 補食

## 3. シート構成
### 3.1 必須
- `Recipes`
- `Ingredients`
- `Steps`

### 3.2 任意
- `Nutrition_Summary`
- `Tags`
- `Meta`

### 3.3 シート名ルール
- 完全一致必須（大文字小文字・アンダースコア含む）
- 余分な空白禁止
- 旧名（例: `Recipe_Master`）は非許容

## 4. 命名規則（Excel Canonical）
### 4.1 規則名
本仕様では Excel列名規則を **Canonical Header Case** と呼ぶ。

### 4.2 形式定義
- 形式: `Title_Word_Separated_By_Underscore`
- 各語は先頭大文字（例: `Recipe`, `Ingredient`, `Weight`）
- 略語は慣例大文字（`ID`, `No`）
- 単位語は接尾辞で付与（例: `_g`, `_kcal`, `_Min`）
- 真偽列は `_Flag` 終端（値は `0/1`）

例:
- `Recipe_ID`
- `Ingredient_Name`
- `Gross_Weight_g`
- `Total_Time_Min`
- `Is_Active`

## 5. シート別正式列
## 5.1 Recipes（必須列）
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

## 5.2 Recipes（任意列）
- `Meal_Type`
- `Total_Weight_Before_Cooking_g`
- `Total_Weight_After_Cooking_g`
- `Cooking_Method`
- `Prep_Time_Min`
- `Cook_Time_Min`
- `Difficulty`
- `Cost_Estimate_JPY`
- `Athlete_Tag_List`
- `General_Tag_List`
- `Timing_Tag_List`
- `Purpose_Tag_List`
- `Allergy_Tag_List`
- `Description`
- `Notes`
- `Source`

## 5.3 Ingredients（必須列）
- `Recipe_ID`
- `Ingredient_No`
- `Ingredient_Name`
- `Amount`
- `Unit`
- `Net_Weight_g`
- `Optional_Flag`

## 5.4 Ingredients（任意列）
- `Food_ID`
- `Ingredient_Display_Name`
- `Gross_Weight_g`
- `Preparation_State`
- `Process`
- `Yield_Rate_Applied`
- `Retention_Rule_Applied`
- `Substitute_Group`
- `Notes`

## 5.5 Steps（必須列）
- `Recipe_ID`
- `Step_No`
- `Step_Text`

## 5.6 Steps（任意列）
- `Step_Title`
- `Step_Time_Min`
- `Heat_Level`
- `Cooking_Method`
- `Notes`

## 5.7 Nutrition_Summary（任意シート）
推奨列:
- `Recipe_ID`
- `Basis`
- `Energy_kcal`
- `Protein_g`
- `Fat_g`
- `Carbohydrate_g`
- `Water_g`
- `Calcium_mg`
- `Iron_mg`
- `Salt_g`
- `Vitamin_B1_mg`
- `Vitamin_B2_mg`
- `Vitamin_B6_mg`
- `Vitamin_B12_ug`
- `Vitamin_C_mg`
- `Vitamin_D_ug`
- `Retinol_Activity_Equivalent_ugRAE`

## 6. ID・再投入・一意性
- `Recipe_ID` 形式: `<CATEGORY_PREFIX>_<6桁連番>`（例: `RICE_000123`）
- `Ingredient_No`: Recipe単位で `1..N` 連番（重複/欠番禁止）
- `Step_No`: Recipe単位で `1..N` 連番（重複/欠番禁止）
- 再投入キー:
  - 親: `Recipe_ID`
  - 材料: `(Recipe_ID, Ingredient_No)`
  - 手順: `(Recipe_ID, Step_No)`

## 7. Food_ID と Ingredient_Name の扱い（確定）
- `Ingredient_Name` は常に必須（空欄禁止）
- `Food_ID` は条件付き必須ではなく **任意**
- `Food_ID` が未設定でも投入可能（WARN扱い）
- ただし `Food_ID` が設定されている場合は書式検証を行う

## 8. タグ設計
- Excel入力は `*_Tag_List`（CSV）を許容
- `Tags` シートがある場合は `Tags` を優先
- DB正本は `recipe_tags`（正規化）を推奨
- API返却は `snake_case` キーで返す（例: `tags`, `tag_type`）

## 9. 栄養価設計
- マクロ4項目（`Energy_kcal`, `Protein_g`, `Fat_g`, `Carbohydrate_g`）は `Recipes` で必須
- 微量栄養素は `Nutrition_Summary`（任意）で管理
- Excel数式は禁止。値貼り付けのみ
- `#N/A`, `#VALUE!`, `#REF!`, `#DIV/0!`, `#NAME?`, `#NULL!`, `#NUM!` は不正値

## 10. 型・単位・NULL ルール
- 真偽: `0/1` のみ
- 数値: 数値型のみ許容（文字列数値はパース不可とする）
- 単位許容: `g`, `kg`, `ml`, `L`, `個`, `枚`, `本`, `小さじ`, `大さじ`, `適量`
- 空欄セル: `NULL`
- 空文字 `""` と空白のみ文字列: 不正
- 改行許容: `Description`, `Notes`, `Step_Text`

## 11. 変換責務（Excel -> Python -> DB/API）
### 11.1 Excel読込
- Canonical列名で受理
- 列名完全一致チェック後、内部 `snake_case` に変換

### 11.2 DB投入
- 内部 `snake_case` をそのままDB `snake_case` へ投入

### 11.3 API返却
- DB/内部 `snake_case` を JSON `snake_case` で返却
- APIでは Canonical列名を返さない

### 11.4 Excel再出力
- エクスポート時のみ `snake_case` -> Canonical列名へ逆変換

## 12. API/UI要件（命名整合）
- 一覧/詳細/検索/献立生成APIのJSONキーは `snake_case` 固定
- UI実装（Expo/React Native/Web）は `snake_case` 前提で受け取る
- Excel列名はAPIに流出させない

## 13. validate_recipe_excel.py 実装原則
- 検証対象は Excelの Canonical列名
- 列名完全一致チェックを必須化
- エイリアス吸収を禁止
- `Ingredient_Name` 欠落をERROR
- Excelエラー値をERROR

## 14. 採用しなかった代替案
- Excel/DB/APIを同一列名で統一する案
  - 不採用理由: Python/DB/APIの実装保守性が低下するため
- ローダーで列名ゆらぎ吸収する案
  - 不採用理由: 基準文書としての強制力が失われるため

## 15. 最小テンプレート例
### 15.1 Recipes（1行）

| Recipe_ID | Recipe_Name | Category | Subcategory | Serving_Size | Yield_Flag | Retention_Flag | Total_Time_Min | Version | Is_Active | Energy_kcal | Protein_g | Fat_g | Carbohydrate_g |
|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| RICE_000123 | 鮭おにぎり | 主食 | ごはん | 1.00 | 1 | 1 | 15 | v1.0 | 1 | 320.5 | 14.2 | 5.1 | 56.8 |

### 15.2 Ingredients（3行）

| Recipe_ID | Ingredient_No | Food_ID | Ingredient_Name | Amount | Unit | Net_Weight_g | Optional_Flag |
|---|---:|---|---|---:|---|---:|---:|
| RICE_000123 | 1 | F000101 | 白米 | 180 | g | 175.0 | 0 |
| RICE_000123 | 2 | F000876 | 鮭フレーク | 35 | g | 33.5 | 0 |
| RICE_000123 | 3 |  | 食塩 | 0.8 | g | 0.8 | 1 |

### 15.3 Steps（3行）

| Recipe_ID | Step_No | Step_Text |
|---|---:|---|
| RICE_000123 | 1 | 米を洗い、30分浸水する。 |
| RICE_000123 | 2 | 炊飯して粗熱を取る。 |
| RICE_000123 | 3 | 鮭を混ぜて握る。 |
