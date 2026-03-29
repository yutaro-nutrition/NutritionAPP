# 1. 目的
DB依存テストを再現可能に実行するための最低成立条件を固定し、接続失敗・seed不足・手順差異の切り分けを標準化する。

# 2. 対象テスト
- `tests/test_option2_db_integration_postgres.py`
- `tests/test_pipeline_db_integration_postgres.py`
- `app_api/tests/test_db_connection.py`
- `app_api/tests/test_recipe_repository.py`
- `app_api/tests/test_menu_api.py`
- `app_api/tests/test_vocabulary_api.py`

# 3. 必要な環境変数
## 3.1 integration tests（`tests/conftest.py` 経由）
- `TEST_POSTGRES_HOST` (default: `127.0.0.1`)
- `TEST_POSTGRES_PORT` (default: `55432`)
- `TEST_POSTGRES_DB` (default: `recipe_test_db`)
- `TEST_POSTGRES_USER` (default: `recipe_test_user`)
- `TEST_POSTGRES_PASSWORD` (default: `recipe_test_password`)
- `TEST_POSTGRES_SCHEMA` (optional)

## 3.2 app_api/tests（`app.core.config` 経由）
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

補足:
- `app_api/tests/conftest.py` では `POSTGRES_DB=recipe_db` を `setdefault` するため、未指定時は `recipe_db` 側へ接続し得る。

# 4. 標準DB起動手順
標準手順（採用）:
```bash
docker compose up -d postgres_test
```

採用理由:
- `docs/db_integration_postgres_test_usage.md` の主手順と一致。
- サービス名ベースで起動でき、再現手順として文書化しやすい。

起動確認:
```bash
docker compose ps
```
- `postgres_test` が `healthy` であること。

# 5. 代替手順
代替手順（条件付き）:
```bash
docker start recipe-postgres-test
```

使用条件:
- `docker compose up -d postgres_test` が project name 解決/コンテナ名競合等で失敗する環境。
- 既存固定名コンテナ `recipe-postgres-test` が事前に存在する場合のみ。

docs 間の矛盾（明示）:
- `docs/db_integration_postgres_test_usage.md` は `docker compose up -d postgres_test` を主手順として記載。
- `docs/integration_test_baseline_2026-03-29.md` は環境制約付きで `docker start recipe-postgres-test` を採用。
- 本ガイドでは「composeを標準、docker startを例外時代替」に統一する。

# 6. 最低限必要なDB状態
- 接続可能であること（host/port/db/user/password が一致）。
- `tests` 側 integration は `tests/conftest.py` により以下を自動実施:
  - `create_tables.sql` 適用
  - `app_api/sql/migrations/*.sql` 適用
  - session内 schema 初期化/終了時クリーンアップ（`TEST_POSTGRES_SCHEMA` 未指定時）
- `app_api/tests` は自動初期化fixtureを持たないため、以下が事前に必要:
  - `recipes` テーブルに少なくとも1件
  - その `recipe_id` に対応する `recipe_ingredients` / `recipe_steps` が少なくとも1件

# 7. seed/初期データの前提
- integration tests (`tests/test_*_db_integration_postgres.py`):
  - seedは原則不要（テスト側で workbook 生成 + pipeline投入）。
- `app_api/tests`:
  - seed前提が必要。
  - 推奨導線: `scripts/run_db_import.ps1`（`app_api/scripts/import_integrated_csv.py` を実行）で統合CSV投入。

不明点（明示）:
- `app_api/tests/test_menu_api.py` と `test_vocabulary_api.py` が安定通過する最小データ件数・分布は現時点で未固定。

# 8. 典型失敗パターンと確認項目
1. 接続失敗 (`test_db_connection` 失敗 / integrationがskip)
- 確認:
  - DB起動状態
  - `TEST_POSTGRES_*` / `POSTGRES_*` の値
  - ポート競合

2. テーブル不在/スキーマ不一致
- 確認:
  - `tests` 側: `ensure_test_tables` が動いているか
  - `app_api/tests` 側: 事前DDL適用済みか

3. seed不足 (`test_recipe_repository`, `test_menu_api`, `test_vocabulary_api` 失敗)
- 確認:
  - `recipes` 件数 > 0
  - 対応 `recipe_ingredients` / `recipe_steps` 存在
  - メニュー生成対象カテゴリのデータ有無

4. schema指定不整合 (`--db-schema` 失敗)
- 確認:
  - `TEST_POSTGRES_SCHEMA` の指定値
  - 固定schema利用時の権限/存在

# 9. 実行コマンド例
## 9.1 integration tests
```bash
python -m pytest tests/test_option2_db_integration_postgres.py tests/test_pipeline_db_integration_postgres.py -m integration -q
```

## 9.2 app_api DB依存 tests
```bash
python -m pytest app_api/tests/test_db_connection.py app_api/tests/test_recipe_repository.py app_api/tests/test_menu_api.py app_api/tests/test_vocabulary_api.py -q
```

## 9.3 app_api向け seed 導線（推奨）
```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_db_import.ps1
```

# 10. 注意事項
- 本ガイドは「前提固定」が目的であり、テストコード変更は含まない。
- `app_api/tests` は marker未付与でも運用上は `db_required` として扱う。
- `docker start recipe-postgres-test` は標準ではなく、compose失敗時の例外手順。
- 不明点（app_api最小seed要件）は後続タスクで固定する。
