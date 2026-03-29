# 統合レシピDB スキーマ定義

## 1. 統合対象の考え方
- 入力は `data/generated/*.xlsx` のカテゴリ別レシピDB。
- 各xlsxの3シート（`Ingredients` / `Steps` / `Recipe_Master`）を正規化し、単一の論理DBへ統合する。
- QA結果（`qa_status`）を統合判定に利用し、既定では `passed` のみ本体へ投入する。
- `source_file` / `source_batch` / `version` を保持し、追跡可能性（lineage）を担保する。

## 2. テーブル一覧
- `recipe_master_all`
- `recipe_ingredients_all`
- `recipe_steps_all`

## 3. 主キー・外部キーの考え方
- 主キー:
  - `recipe_master_all.recipe_id`
  - `recipe_ingredients_all`: `(recipe_id, line_no)`
  - `recipe_steps_all`: `(recipe_id, step_number)`
- 外部キー:
  - `recipe_ingredients_all.recipe_id -> recipe_master_all.recipe_id`
  - `recipe_steps_all.recipe_id -> recipe_master_all.recipe_id`
- 方針:
  - 統合時に `recipe_id` 重複は禁止。
  - 重複が検出された `recipe_id` は統合対象から除外し、summaryへ記録する。

## 4. レベル別カテゴリ設計
- `category_lv1`（標準）:
  - 主食 / 丼 / 主菜 / 副菜 / 汁物 / デザート
- `category_lv2`（標準例）:
  - うどん / そば / らーめん / パン / 丼
  - 牛肉主菜 / 豚肉主菜 / 鶏肉主菜 / 魚介主菜
  - 副菜低タンパク / 副菜タンパク質5g程度
  - 汁物 / 果物乳製品デザート
- `category_lv3`:
  - 将来の細分類（例: 味付け、調理時間帯、用途）拡張用。初期は空文字を許容。

## 5. qa_status 運用
- 値:
  - `passed`
  - `manual_review`
  - `failed`
- 既定動作:
  - `passed` のみ統合本体へ投入。
  - `manual_review` / `failed` / `qa_status未取得` は `output/integrated/rejected/` へ分離。
- 取得元:
  - `reports/validation/summary_validation_report.json` を優先。
  - 不足時は `reports/validation/validation_*.json` / `*_validation.json` を補助利用。

## 6. source_file / source_batch / version の定義
- `source_file`:
  - 元xlsxファイル名（例: `recipe_db_udon_100.xlsx`）
- `source_batch`:
  - `master/category_master.csv` の `default_batch` を基本値として採用。
  - ファイル名に `_batchN` が含まれる場合は上書き導出を許容。
- `version`:
  - `default_version` を基礎に運用日を付与可能。
  - 既定例:
    - `v1.0_udon_20260320`
    - `v1.0_soba_20260320`
    - `v1.0_donburi_20260320`

## 7. 正規化ルール
- Ingredient:
  - `ingredient_alias_master.csv` による表記ゆれ吸収（`raw_name -> normalized_name`）。
  - Unicode正規化（NFKC）、前後空白削除、連続空白の縮約。
- Cooking_Method:
  - 標準候補へマッピング（`ゆで / 煮る / 炒める / 焼く / 蒸す / 揚げる / 和える / 温製 / 冷製 / かける`）。
- Tag:
  - 区切りを `, ` に統一。
  - 重複削除。
  - 推奨順固定（高たんぱく、低脂質、高炭水化物、試合前、試合後、増量期、減量期）。
- Notes / Recipe_Name:
  - 前後空白除去、過剰な空白揺れ抑制。
- 数値列:
  - `to_numeric(errors='coerce')` による型統一。

## 8. API利用を想定した列設計

### recipe_master_all
- `recipe_id`
- `recipe_name`
- `category_lv1`
- `category_lv2`
- `category_lv3`
- `energy_kcal`
- `protein_g`
- `fat_g`
- `carbohydrate_g`
- `p_ratio`
- `f_ratio`
- `c_ratio`
- `tags`
- `cooking_method`
- `notes`
- `source_file`
- `source_batch`
- `qa_status`
- `version`
- `created_at`
- `updated_at`

### recipe_ingredients_all
- `recipe_id`
- `line_no`
- `ingredient_name`
- `ingredient_alias`
- `weight_g`
- `notes`
- `source_file`
- `source_batch`
- `qa_status`
- `version`

### recipe_steps_all
- `recipe_id`
- `step_number`
- `instruction`
- `source_file`
- `source_batch`
- `qa_status`
- `version`

## 9. 今後カテゴリ追加時の拡張方針
- 拡張点は `master/category_master.csv` への1行追加を基本とする。
- ETL本体は `file_pattern` でカテゴリ解決するため、コード改修を最小化できる。
- `category_lv3` と `version` を利用して、将来の粒度拡張・モデル改修を吸収する。
- QA連携はファイル名単位で解決するため、追加カテゴリも同じバリデーション運用へ接続可能。

## 10. 簡易運用手順
- 実行コマンド:
  - `powershell -ExecutionPolicy Bypass -File scripts\run_integration.ps1`
- 入力ディレクトリ:
  - `data/generated/`
- 出力ディレクトリ:
  - `output/integrated/`
- `qa_status` の扱い:
  - 既定では `passed` のみ本体統合。
  - `manual_review` / `failed` / 未取得は `rejected` へ分離。
- rejectedファイルの確認方法:
  - `output/integrated/rejected/rejected_files.json`
  - `output/integrated/rejected/rejected_recipe_master_all.csv`
  - `output/integrated/rejected/rejected_recipe_ingredients_all.csv`
  - `output/integrated/rejected/rejected_recipe_steps_all.csv`
- 統合後に次に行うべき処理:
  - PostgreSQL投入（`COPY` またはバルクインサート）
  - FastAPI/検索APIへ接続し、`recipe_id` 基点で `master + ingredients + steps` を結合利用
