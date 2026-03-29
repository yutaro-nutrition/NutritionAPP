# Validator Execution Order and Error Priority Spec v1.0

## 1. 目的
本仕様は、Recipe Excel Canonical Spec v1.0 を前提に、validator の検証順序、打ち切り条件、エラー優先順位、エラー分類、エラー出力最小構造を固定することを目的とする。  
本仕様は「どう検証すべきか」を定義するものであり、既存実装の挙動そのものは変更対象外とする。

## 2. 適用範囲
本仕様は、canonical workbook（`Recipes` / `Ingredients` / `Steps`）に対する入力検証処理に適用する。  
loader、pipeline、アプリ画面の表示仕様は本仕様の直接対象外とする。  
ただし、validator から出力されるエラー情報を利用する処理は、本仕様のエラー分類と優先順位を前提として扱う。

## 3. 前提となる canonical spec v1.0
前提は `docs/recipe_excel_canonical_spec_v1.md` とし、以下を固定条件として扱う。

1. workbook は 3 シート固定（`Recipes` / `Ingredients` / `Steps`）、補助シートなし
2. 各シートの必須列名と列順は固定
3. `Category_Code` は 8 値固定
4. `Tags` は 16 値固定、`|` 区切り、1〜5 個、`batch_cook` 不許可
5. `Process_Code` は 8 値固定
6. `Unit` は `g` / `ml` のみ、`㎖` 不許可
7. 数量管理方式は `Amount_Value + Unit` 固定

## 4. validator の責務
validator の責務は次の 3 点とする。

1. canonical spec v1.0 違反を、定義済みフェーズ順序で検出する
2. 検出した違反を、定義済みエラー分類と優先順位で評価する
3. `first_failure` と `all_errors` を分離して出力できる最小情報を返す

validator は、入力修正・自動補正・暗黙変換を行わない。

## 5. 検証フェーズ定義
### Phase 1: Workbook 構造検証
検証対象:

1. シート数（3 固定）
2. シート名完全一致
3. 各シートの存在有無
4. 必須列名の一致
5. 列順の一致

エラー分類: `STRUCTURE_ERROR`

### Phase 2: 行レベル値検証
検証対象:

1. 空欄禁止列
2. `Servings` 正の整数
3. `Amount_Value` 正の数値
4. `Category_Code` enum
5. `Tags` enum / 個数（1〜5）/ 区切り（`|`）
6. `Process_Code` enum
7. `Unit` enum（`g` / `ml`）と `㎖` 不許可

エラー分類: `VALUE_ERROR`

### Phase 3: 一意性検証
検証対象:

1. `Recipes.Recipe_ID` 一意
2. (`Ingredients.Recipe_ID`, `Ingredient_No`) 一意
3. (`Steps.Recipe_ID`, `Step_No`) 一意

エラー分類: `UNIQUENESS_ERROR`

### Phase 4: 参照整合性検証
検証対象:

1. `Ingredients.Recipe_ID -> Recipes.Recipe_ID`
2. `Steps.Recipe_ID -> Recipes.Recipe_ID`

エラー分類: `REFERENCE_ERROR`

## 6. フェーズ実行順序
実行順序は固定で以下とする。

1. Phase 1（構造）
2. Phase 2（値）
3. Phase 3（一意性）
4. Phase 4（参照整合性）

この順序は validator v1.0 の正式順序であり、入れ替えを認めない。

## 7. 各フェーズの打ち切り条件
### 7.1 Phase 1 の打ち切り
1. Phase 1 で 1 件以上の `STRUCTURE_ERROR` がある場合、Phase 2〜4 は実行しない
2. 結果は構造エラーのみで終了する

理由:

1. 構造未確定で後続検証を行うと、副次エラーが連鎖し主因判定が不明瞭になる
2. `invalid_sheet_name.xlsx`、`invalid_missing_recipe_column.xlsx` を構造主因で終了させるため

### 7.2 Phase 2 の後続条件
1. Phase 2 の実行条件は Phase 1 成功のみ
2. Phase 2 で `VALUE_ERROR` が発生しても、Phase 3 は実行する
3. Phase 4 は「参照キーとして使う列の Phase 2 前提が成立した場合のみ」実行する

参照キー前提の定義:

1. `Recipes.Recipe_ID` が型・空欄条件を満たすこと
2. `Ingredients.Recipe_ID` と `Steps.Recipe_ID` が型・空欄条件を満たすこと

上記前提が崩れている場合、Phase 4 は `SKIPPED` とする。

### 7.3 Phase 3 の後続条件
1. Phase 3 で `UNIQUENESS_ERROR` が発生しても、Phase 4 実行可否は 7.2 の参照キー前提で判定する
2. Phase 3 の失敗自体は、Phase 4 の実行停止条件にはしない

### 7.4 Phase 4 の実施条件
Phase 4 は次を満たす場合のみ実施する。

1. Phase 1 が成功
2. 参照キー前提が成立

## 8. エラー分類
エラー分類は以下の 4 種で固定する。

1. `STRUCTURE_ERROR`
2. `VALUE_ERROR`
3. `UNIQUENESS_ERROR`
4. `REFERENCE_ERROR`

代表サブコード（例）:

1. `STRUCTURE_ERROR`
2. `SHEET_COUNT_MISMATCH`
3. `SHEET_NAME_MISMATCH`
4. `MISSING_REQUIRED_SHEET`
5. `COLUMN_MISMATCH`
6. `MISSING_REQUIRED_COLUMN`
7. `COLUMN_ORDER_MISMATCH`
8. `VALUE_ERROR`
9. `REQUIRED_VALUE_MISSING`
10. `INVALID_INTEGER`
11. `INVALID_NUMBER`
12. `INVALID_ENUM_CATEGORY_CODE`
13. `INVALID_ENUM_TAG`
14. `INVALID_TAG_COUNT`
15. `INVALID_TAG_DELIMITER`
16. `INVALID_ENUM_PROCESS_CODE`
17. `INVALID_ENUM_UNIT`
18. `INVALID_UNIT_CHARACTER`
19. `UNIQUENESS_ERROR`
20. `DUPLICATE_RECIPE_ID`
21. `DUPLICATE_INGREDIENT_KEY`
22. `DUPLICATE_STEP_KEY`
23. `REFERENCE_ERROR`
24. `INGREDIENT_RECIPE_ID_NOT_FOUND`
25. `STEP_RECIPE_ID_NOT_FOUND`

注記:

1. サブコードは実装形式を固定しない
2. ただし、上位分類（4 種）は固定とする

## 9. エラー優先順位
優先順位は以下で固定する。

1. `STRUCTURE_ERROR`
2. `VALUE_ERROR`
3. `UNIQUENESS_ERROR`
4. `REFERENCE_ERROR`

`first_failure` 決定規則:

1. 検出エラー集合から、最上位クラスを 1 件選ぶ
2. 同一クラス内の選択順は、`phase -> sheet_name -> row -> column -> error_code` の昇順で決定する

`all_errors` 規則:

1. 打ち切り条件に反しない範囲で検出した全エラーを保持する
2. Phase 1 失敗時は `all_errors` も Phase 1 のみ

## 10. エラー出力の最小構造
エラー出力は少なくとも以下の項目を持つこと。

1. `phase`
2. `error_class`
3. `error_code`
4. `sheet_name`
5. `row`
6. `column`
7. `message`
8. `severity`
9. `is_first_failure`

追加で持つべき集約情報:

1. `first_failure`（単一）
2. `all_errors`（配列）
3. `skipped_phases`（配列）

実装形式（JSON / dict / dataclass）は本仕様では固定しない。

## 11. invalid sample との対応方針
`reports/invalid_samples_audit_report.md` の結果を踏まえ、以下を v1.0 の運用方針とする。

1. `invalid_sheet_name.xlsx` は Phase 1 の `STRUCTURE_ERROR` で終了する
2. `invalid_missing_recipe_column.xlsx` も Phase 1 の `STRUCTURE_ERROR` で終了する
3. 上記 2 件では Phase 4 を実行しないため、副次 `REFERENCE_ERROR` を出力しない
4. これにより、invalid sample の「1ファイル1主因」判定に近い挙動を担保する

## 12. v1.0 運用ルール
1. 本仕様は validator 実行仕様の canonical v1.0 とする
2. 検証順序、打ち切り条件、優先順位、エラー分類の変更は v1.1 以降でのみ行う
3. 既存実装との差分があっても、v1.0 仕様を正とする
4. 変更時は invalid sample 監査観点（1ファイル1主因）への影響を必ず評価する

## 13. 今後の実装追随方針
実装追随の指針:

1. validator は本仕様の Phase 制御と `first_failure` / `all_errors` 分離を満たすよう追随する
2. loader / pipeline は validator 出力の `first_failure` を主因表示、`all_errors` を詳細表示に利用できる形へ追随する
3. 追随時は canonical spec v1.0 を緩和しない

現状差分メモ（確認結果）:

1. `scripts/validate_recipe_excel.py` は旧列定義と旧 enum を前提としている
2. 現状実装は構造エラー後も後続チェック相当の副次エラーが発生し得る
3. 本仕様に適合させる実装変更は別タスクで実施する

## 付録A: 具体例
### A-1 構造エラー例
条件:

1. シート名が `Recipe`（`Recipes` ではない）

期待:

1. Phase 1 で `STRUCTURE_ERROR/SHEET_NAME_MISMATCH`
2. Phase 2〜4 は `SKIPPED`
3. `first_failure.error_class=STRUCTURE_ERROR`

### A-2 値エラー例
条件:

1. `Recipes!D2` の `Servings=2.5`

期待:

1. Phase 1 成功
2. Phase 2 で `VALUE_ERROR/INVALID_INTEGER`
3. Phase 3 は実行可
4. `first_failure.error_class=VALUE_ERROR`

### A-3 一意性エラー例
条件:

1. 同一 `Recipe_ID` 内で `Ingredient_No=1` が重複

期待:

1. Phase 1,2 成功
2. Phase 3 で `UNIQUENESS_ERROR/DUPLICATE_INGREDIENT_KEY`
3. Phase 4 は参照キー前提成立時に実行可
4. `first_failure.error_class=UNIQUENESS_ERROR`

### A-4 参照整合性エラー例
条件:

1. `Ingredients.Recipe_ID=R999` が `Recipes.Recipe_ID` に存在しない

期待:

1. Phase 1,2 実施
2. 参照キー前提成立時に Phase 4 で `REFERENCE_ERROR/INGREDIENT_RECIPE_ID_NOT_FOUND`
3. `first_failure.error_class=REFERENCE_ERROR`（上位クラス未検出時）

### A-5 複数違反の first-failure 判定例
条件:

1. `Servings=2.5`（値違反）
2. `Ingredient_No` 重複（一意性違反）
3. `Ingredients.Recipe_ID` 不整合（参照違反）

期待:

1. `all_errors` には 3 種の違反を保持
2. `first_failure` は優先順位により `VALUE_ERROR`
