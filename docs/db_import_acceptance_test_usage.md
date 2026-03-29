# DB Import Acceptance Test Usage

## Purpose
`import_recipe_excel_pipeline.py` の受け入れテストを、DB投入ステップ込みで安全に検証する手順です。  
本テストは実DBを使わず、pytest実行時に生成される疑似DBローダーで再現性を確保します。

## Covered Cases
- validate `PASS` 時のみ DB投入へ進む
- validate `FAIL` 時は DB投入されない
- `--fail-on-warning` 時は DB投入されない
- `--dry-run` 時は DB状態が変更されない
- 同一ファイル再投入時に件数が不正増加しない（UPSERT/冪等性）

## Prerequisites
1. Python 3.11+
2. 依存インストール

```bash
pip install -r requirements.txt
pip install pytest
```

## Run
プロジェクトルートで実行:

```bash
pytest tests/test_pipeline_db_import_acceptance.py -q
```

既存の受け入れテストとまとめて実行:

```bash
pytest tests/test_pipeline_acceptance.py tests/test_pipeline_db_import_acceptance.py -q
```

## Notes
- テストは `tmp_path` 配下に一時Excelと疑似DB状態ファイルを生成します。
- `--db-loader-script` を通じて疑似ローダーを注入し、実DB接続は行いません。
- 実DB (`PostgreSQL`) への接続確認はこのテストスイートの対象外です。
- 実DB接続での統合確認は `docs/db_integration_postgres_test_usage.md` を参照してください。
