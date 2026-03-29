# Pipeline Acceptance Test Usage

## Purpose
`validate_recipe_excel.py` / `convert_legacy_recipe_excel.py` / `import_recipe_excel_pipeline.py` の統合受け入れテストを `pytest` で再現実行するための手順です。

## Covered Cases
- legacy正常変換 -> validate PASS
- canonical正常 -> validate PASS
- 必須シート欠落 -> FAIL
- Ingredient_Name欠落 -> FAIL
- Food_ID未設定 -> WARN
- `#N/A`相当のExcelエラートークン混入（`#VALUE!`） -> FAIL
- `--fail-on-warning` 時の停止
- DB投入未実行時の正常終了

## Prerequisites
1. Python 3.11+
2. 依存インストール

```bash
pip install -r requirements.txt
pip install pytest
```

## Run All Acceptance Tests
プロジェクトルートで実行:

```bash
pytest tests/test_pipeline_acceptance.py -q
```

## Run Individual Case
例: fail-on-warning 停止ケースのみ

```bash
pytest tests/test_pipeline_acceptance.py -k fail_on_warning -q
```

## Notes
- テスト用Excelは `tests/fixtures/workbook_factory.py` から各テスト実行時に一時ディレクトリへ生成されます。
- DB接続は不要です（`--import-db` を使うケースを含めていません）。
- パイプライン実行時の成果物は pytest の `tmp_path` 配下へ出力されます。
