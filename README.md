# Excel to PostgreSQL Importer

Excelファイルの `Ingredients` / `Steps` / `Recipe_Master` シートを、`public.recipes` 親モデルに沿って安全に投入するローダーです。

## 現在の正式仕様
- 親: `public.recipes`
- 参照ビュー: `public.recipe_master`（書き込み禁止）
- 子:
  - `public.recipe_ingredients`
  - `public.recipe_steps`
- 子投入は `INSERT only`（重複は `ON CONFLICT DO NOTHING`）

## 実行例
```bash
python load_excel_to_postgres.py \
  --excel "recipe_db_main_chicken_100_batch1.xlsx" \
  --host localhost \
  --port 5432 \
  --db-name recipe_db \
  --user postgres \
  --report "reports/import_main_chicken.json"
```

Dry-run:
```bash
python load_excel_to_postgres.py \
  --excel "recipe_db_main_chicken_100_batch1.xlsx" \
  --db-name recipe_db \
  --dry-run \
  --report "reports/dry_run_main_chicken.json"
```

## 主要オプション
- `--parent-existing-mode skip|update`
  - `skip`（既定）: 親既存時はスキップ
  - `update`: 親既存時に更新
- `--dry-run`: トランザクションを最後にロールバック
- `--report`: JSON検証レポート出力先

## 詳細仕様
`docs/recipes_loader_formal_spec.md` を参照してください。

## API / 献立MVP (Phase1)
`app_api` に PostgreSQL参照APIのMVPを追加済みです。

### セットアップ (PowerShell)
```powershell
python -m pip install -r app_api/requirements_api.txt
```

`.env` 例:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=recipe_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
```

### 起動 (PowerShell)
```powershell
python -m uvicorn app.main:app --reload --app-dir app_api
```

### エンドポイント
- `GET /health`
- `GET /recipes`
- `GET /recipes/{recipe_id}`
- `POST /menu/generate`
- `GET /meta/options`（語彙オプション取得）

主なエラー:
- `GET /recipes/{recipe_id}`: `404`（指定IDが存在しない）
- `POST /menu/generate`: `400`（不正入力/内部スロット不整合）、`404`（候補なし）
- 共通: `422`（バリデーションエラー）

エラーレスポンス形式（統一）:
```json
{
  "error_code": "VALIDATION_ERROR",
  "detail": "..."
}
```

`error_code` 一覧:
- `RECIPE_NOT_FOUND`
- `INVALID_PARAMETER`
- `MENU_GENERATION_FAILED`
- `NO_RECIPES_FOUND`
- `VALIDATION_ERROR`

`POST /menu/generate` 追加項目（各 pattern）:
- `nutrition_summary`（目標値と実値の差）
- `constraint_evaluation`（適合度と制約緩和有無）
- `applied_conditions`（scene / meal_type / include_dessert）
- `generation_note`（人間向け説明文）

フロント実装の使い方例:
- エラー時は `error_code` で画面分岐し、`detail` を表示文言に使う。
- 献立結果は `nutrition_summary` を使って「目標との差」を表示し、`generation_note` を補足説明として表示する。
- 固定選択肢は `GET /meta/options` を参照し、UI表示は日本語ラベル、API送信はコード値を推奨。

語彙定義の詳細:
- `docs/api_vocabulary_guide.md`

フロント接続ガイド:
- `docs/frontend_api_integration_guide.md`
- `docs/error_ui_mapping_guide.md`
- `docs/frontend_common_api_handler_guide.md`
- `docs/ui_component_api_mapping.md`

### テスト (PowerShell)
```powershell
$env:POSTGRES_DB='recipe_db'
python -m pytest app_api/tests -q
```
