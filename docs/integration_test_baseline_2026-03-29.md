# Integration Test Baseline (Final Draft Before Git Freeze)

## Purpose
直近で安定化した integration test 基盤の状態を、比較可能かつ監査可能な基準線として固定する。  
本資料は **Git 固定前の最終版ドラフト** であり、実行条件・確認方法・対象外を明示する。

## 実行日時
- 文書更新日時: 2026-03-29 JST
- テスト実行日時: 2026-03-29 JST
- 実行ディレクトリ: `C:\Users\yurar\.codex\献立作成`

## 実行前提
- 対象範囲は以下の2ファイルのみ。
  - `tests/test_option2_db_integration_postgres.py`
  - `tests/test_pipeline_db_integration_postgres.py`
- コード本体（validator/import/API 実装）は変更しない。
- PostgreSQL テストコンテナ `recipe-postgres-test` が利用可能であること。
- Python 実行環境で `requirements.txt` と `pytest` をインストール済みであること。

## 必要環境変数
- 必須ではない（未指定時はデフォルトを利用）。
- 任意設定可能な変数:
  - `TEST_POSTGRES_HOST` (default: `127.0.0.1`)
  - `TEST_POSTGRES_PORT` (default: `55432`)
  - `TEST_POSTGRES_DB` (default: `recipe_test_db`)
  - `TEST_POSTGRES_USER` (default: `recipe_test_user`)
  - `TEST_POSTGRES_PASSWORD` (default: `recipe_test_password`)
  - `TEST_POSTGRES_SCHEMA` (default: 未指定時は `it_<uuid>` を動的生成)

## 再実行手順
1. 依存インストール
```bash
pip install -r requirements.txt
pip install pytest
```
2. PostgreSQL コンテナ起動
```bash
docker start recipe-postgres-test
```
3. Option2 DB integration 実行
```bash
python -m pytest tests/test_option2_db_integration_postgres.py -m integration -q
```
4. Pipeline DB integration 実行
```bash
python -m pytest tests/test_pipeline_db_integration_postgres.py -m integration -q
```
5. 必要に応じて同時実行
```bash
python -m pytest tests/test_option2_db_integration_postgres.py tests/test_pipeline_db_integration_postgres.py -m integration -q
```

## 期待結果
- `tests/test_option2_db_integration_postgres.py`: `6 passed`
- `tests/test_pipeline_db_integration_postgres.py`: `11 passed`
- `-m integration` 実行で skipped ではなく pass すること。

## 確認方法
### 1) テスト結果確認
- `python -m pytest tests/test_option2_db_integration_postgres.py -m integration -q`
  - 実測結果: `6 passed in 25.69s`
- `python -m pytest tests/test_pipeline_db_integration_postgres.py -m integration -q`
  - 実測結果: `11 passed in 78.85s`

### 2) Git ベース差分確認
- 実行コマンド:
```bash
git status --short
git diff --stat
```
- 実行結果:
  - どちらも `git` コマンド未検出で失敗  
    (`The term 'git' is not recognized as a name of a cmdlet...`)
- 補足:
  - 本作業ディレクトリには `.git` ディレクトリが存在せず、Git 管理下での差分出力が取得できない。
  - そのため本資料では「Git 差分は未取得（環境制約）」を明示し、変更対象を docs に限定して管理する。

## schema isolation (`it_<uuid>`) 監査メモ
### どこで確認したか
- `tests/conftest.py`
  - `postgres_isolated_config`
  - `ensure_test_tables`

### 何が確認済みか
- `TEST_POSTGRES_SCHEMA` 未指定時、`it_<uuid>` 形式の schema 名を生成する実装がある。
- session 開始時に `CREATE SCHEMA IF NOT EXISTS` を実行し、該当 schema に対して
  `create_tables.sql` と `migrations/*.sql` を適用する。
- session 終了時、動的 schema を `DROP SCHEMA IF EXISTS ... CASCADE` で削除する実装がある。

### 何が未確認か
- 実行ログでの schema 名実測トレース（`it_<uuid>` の実値採取）は今回未取得。
- `TEST_POSTGRES_SCHEMA` 固定指定時の長期運用ルール・競合回避は未監査。

## 対象外 / 未確認範囲
- `tests/test_pipeline_acceptance.py` など非DB acceptance 系の再検証
- API レイヤー E2E の再検証
- 本番相当データ量での性能・耐久確認
- CI 環境での Git 差分出力取得可否

## 注意点
- `docker start recipe-postgres-test` を基準線手順にした理由:
  - この環境では `docker compose up -d postgres_test` が project name 解決エラーや
    container name 競合を起こしたため、既存の固定名コンテナを直接起動する手順のほうが再現性が高かった。
- 本基準線は「文書化と再実行導線の固定」が目的であり、実装仕様の追加確定資料ではない。

## 実リポジトリ最終確認（Git 固定直前）
### `.git` 有無確認
- 確認コマンド:
```bash
Test-Path .git
Get-ChildItem -Force -Directory -Recurse -Filter .git
```
- 結果:
  - `C:\Users\yurar\.codex\献立作成` 直下に `.git` は存在しない。
  - 配下再帰探索でも `.git` は未検出。

### Git 差分コマンド実行
- 実行コマンド:
```bash
git status --short
git diff --stat
```
- 実行場所:
  - `C:\Users\yurar\.codex\献立作成`
  - `C:\Users\yurar\.codex\献立作成\master`
- 結果:
  - いずれも失敗。
  - エラー: `The term 'git' is not recognized as a name of a cmdlet...`

### docs-only 判定
- 判定結果: **Git 機械判定は未完了（環境制約）**
- 理由:
  - Git コマンド未導入または PATH 未設定、かつ `.git` 未検出のため、
    `git status --short` / `git diff --stat` による機械判定が実行不能。
- 現時点の作業実績:
  - 本ターンで実際に編集したのは本ドキュメント（`docs/integration_test_baseline_2026-03-29.md`）のみ。
