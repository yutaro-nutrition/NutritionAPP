# DB Integration Test Usage (Docker/PostgreSQL)

## Purpose
`import_recipe_excel_pipeline.py` + `load_excel_to_postgres.py` を、実PostgreSQLに接続して統合確認する手順です。  
疑似DBローダーではなく、実DBへのINSERT/UPSERT挙動を検証します。

## Latest Baseline
直近の安定化基準線と再実行結果は以下を参照:
- `docs/integration_test_baseline_2026-03-29.md`

## Prerequisites
1. Docker / Docker Compose が利用可能
2. Python 3.11+
3. 依存インストール

```bash
pip install -r requirements.txt
pip install pytest
```

## 1) PostgreSQL起動
プロジェクトルートで実行:

```bash
docker compose up -d postgres_test
```

デフォルト接続情報（`docker-compose.yml`）:
- host: `127.0.0.1`
- port: `5432`
- db: `recipe_test_db`
- user: `recipe_test_user`
- password: `recipe_test_password`

必要に応じて環境変数で上書き可能:
- `TEST_POSTGRES_HOST`
- `TEST_POSTGRES_PORT`
- `TEST_POSTGRES_DB`
- `TEST_POSTGRES_USER`
- `TEST_POSTGRES_PASSWORD`
- `TEST_POSTGRES_SCHEMA` (optional: 固定schemaを使いたい場合のみ指定)

テスト初期化前提:
- integration test は `tests/conftest.py` の `ensure_test_tables` で `app_api/sql/create_tables.sql` を適用し、
  続けて `app_api/sql/migrations/*.sql` をファイル名昇順で適用する。
- `TEST_POSTGRES_SCHEMA` 未指定時は、pytest session ごとに一時schema（`it_<uuid>`）を払い出して
  そのschemaに対して bootstrap / truncate / テスト実行を行う（session終了時にDROP）。
- 固定schemaを使う必要がある場合のみ `TEST_POSTGRES_SCHEMA` を指定する。

## 2) 実DB統合テスト実行
統合テストのみ:

```bash
python -m pytest tests/test_pipeline_db_integration_postgres.py -m integration -q
```

疑似DB受け入れテストと併走:

```bash
python -m pytest tests/test_pipeline_db_import_acceptance.py tests/test_pipeline_db_integration_postgres.py -q
```

## Covered Cases
- validation pass時のみDB投入
- validation fail時のDB投入ブロック
- `--fail-on-warning` 時のDB投入ブロック
- `--dry-run` 時のDB不変
- 同一ファイル再投入の冪等性
- `--parent-existing-mode skip` の実DB挙動（正式契約）
- `--parent-existing-mode replace` の実DB挙動（正式契約）
- `--parent-existing-mode update` の実DB挙動（legacy互換確認）
- `skip` / `replace` を中心に、`update` は互換確認として扱う
- DB投入失敗時（不正schema指定）に中途半端な状態が残らないこと

## 失敗時の確認ポイント
- `docker compose ps` で `postgres_test` が `healthy` か
- ポート `5432` が他プロセスと競合していないか
- `TEST_POSTGRES_*` 設定が compose と一致しているか
- `python -m pytest ... -m integration -q -s` で詳細ログ確認

## 疑似DBテストとの違い
- 疑似DBテスト: ローダー注入による安全なロジック検証（実DBなし）
- 実DB統合テスト: PostgreSQLへの実接続で件数・内容・モード差分まで検証
