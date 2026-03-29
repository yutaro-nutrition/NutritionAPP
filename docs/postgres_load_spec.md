# PostgreSQL投入仕様（Phase3）

## 1. 目的
- Phase2で統合済みのCSVをPostgreSQLへ安全に投入する。
- 開発環境で再実行可能（idempotent）な投入フローを提供する。
- FastAPI実装でそのまま参照しやすいテーブル設計を採用する。
- 失敗時に原因追跡できるログ/レポートを残す。

## 2. 入力ファイル一覧
- `output/integrated/recipe_master_all.csv`
- `output/integrated/recipe_ingredients_all.csv`
- `output/integrated/recipe_steps_all.csv`
- 参考レポート: `output/integrated/integration_summary_report.json`

存在しない場合は投入処理を開始せず、欠損ファイル一覧を明示して安全停止する。

## 3. PostgreSQL接続方式
- 接続情報は環境変数または`.env`から読み込む。
- 使用キー:
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
- Python側は`pydantic-settings`で設定ロードし、SQLAlchemy Engineを生成する。
- `DATABASE_URL`は`postgresql+psycopg2://...`形式を動的組み立てする。

## 4. テーブル構成
- 親テーブル: `recipes`
- 子テーブル:
  - `recipe_ingredients`
  - `recipe_steps`
- `recipe_id`を論理主キーとして扱い、CSV列構造に忠実な列マッピングを採用。

## 5. 主キー・外部キー
- `recipes.recipe_id`: PRIMARY KEY
- `recipe_ingredients.id`: BIGSERIAL PRIMARY KEY
- `recipe_steps.id`: BIGSERIAL PRIMARY KEY
- 外部キー:
  - `recipe_ingredients.recipe_id -> recipes.recipe_id ON DELETE CASCADE`
  - `recipe_steps.recipe_id -> recipes.recipe_id ON DELETE CASCADE`
- ユニーク制約:
  - `recipe_ingredients(recipe_id, line_no)`
  - `recipe_steps(recipe_id, step_number)`

## 6. インデックス設計
- `idx_recipes_category_lv1`
- `idx_recipes_category_lv2`
- `idx_recipes_qa_status`
- `idx_recipes_protein_g`
- `idx_recipes_fat_g`
- `idx_recipes_carbohydrate_g`
- `idx_recipe_ingredients_recipe_id`
- `idx_recipe_steps_recipe_id`

検索系APIで多用されるカテゴリ軸、栄養軸、親子結合軸を優先している。

## 7. 再実行方針
- Phase3の既定は**truncate + reload**を採用する。
- 実行順:
  1. `recipe_steps` をtruncate
  2. `recipe_ingredients` をtruncate
  3. `recipes` をtruncate
  4. `recipes` を投入
  5. `recipe_ingredients` を投入
  6. `recipe_steps` を投入
- 同一入力で再実行しても同一状態に収束する。
- 将来本番向けにはUPSERT（`ON CONFLICT`）へ移行しやすいよう、主キー/ユニーク制約を先に定義済み。

## 8. エラーハンドリング方針
- 入力ファイル欠損時は即時停止。
- CSV必須列不足、主キー重複、FK不整合、`qa_status`不正、数値不正を投入前に検知。
- DB処理はトランザクションで実行し、例外時はロールバック。
- 失敗時は標準出力・ログ・JSONレポートにエラー内容を残す。

## 9. ログ・レポート出力
- ログ:
  - `output/db_load/logs/db_import_YYYYMMDD_HHMMSS.log`
- 実行レポート:
  - `output/db_load/db_import_report.json`
  - `output/db_load/db_count_check_report.json`
- 補助デバッグ:
  - `output/db_load/debug/`

`db_import_report.json`には以下を最低限出力:
- `started_at_utc`
- `finished_at_utc`
- `status`
- `recipes_csv_rows`
- `ingredients_csv_rows`
- `steps_csv_rows`
- `loaded_recipe_rows`
- `loaded_ingredient_rows`
- `loaded_step_rows`
- `input_files`
- `db_target`
- `truncate_mode`
- `validation_checks`
- `error_message`

## 10. 件数検証方法
- `check_db_counts.py`で以下を検証:
  - `recipes`件数
  - `recipe_ingredients`件数
  - `recipe_steps`件数
  - `category_lv1`別件数
  - `category_lv2`別件数
  - `qa_status`別件数
- 可能な場合はCSV件数とDB件数を比較し、一致/不一致を表示。

## 11. FastAPI前提での設計意図
- `recipes`を集約ルートにし、`recipe_id`中心で詳細APIを組み立てやすくしている。
- `recipe_ingredients`と`recipe_steps`は1対多関係で保持し、順序列（`line_no`,`step_number`）を明示。
- SQLAlchemyモデルを`app_api/app/models/recipe_models.py`に用意し、次フェーズでそのまま利用可能。
- `tags`はPhase3ではTEXT保持。将来的にJSONB化やタグ正規化テーブルへ拡張しやすい。

---

## 運用手順（Phase3）

### 必要パッケージ
- `pandas`
- `openpyxl`
- `sqlalchemy`
- `psycopg2-binary`
- `python-dotenv`
- `pydantic`
- `pydantic-settings`

インストール例:

```powershell
pip install -r app_api\requirements_api.txt
```

### .envの作成方法
`.env.example`をコピーして`.env`を作成し、接続情報を設定する。

```powershell
Copy-Item .env.example .env
```

### テーブル作成方法
`import_integrated_csv.py`実行時に`app_api/sql/create_tables.sql`を自動適用する。
DDLのみ先に適用したい場合は同スクリプト内処理を利用可能。

### CSV投入方法

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_db_import.ps1
```

または単体実行:

```powershell
python app_api\scripts\import_integrated_csv.py
```

### 件数確認方法

```powershell
python app_api\scripts\check_db_counts.py
```

結果は`output/db_load/db_count_check_report.json`に出力される。

### 失敗時に見るべきログ
- `output/db_load/db_import_report.json`
- `output/db_load/logs/db_import_*.log`
- `output/db_load/db_count_check_report.json`

### 次フェーズでFastAPIが使うファイル
- `app_api/app/core/config.py`
- `app_api/app/db/session.py`
- `app_api/app/models/recipe_models.py`
- `app_api/sql/create_tables.sql`
- `app_api/scripts/import_integrated_csv.py`
- `app_api/scripts/check_db_counts.py`
