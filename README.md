# 献立作成 MVP

Next.js フロントエンドと FastAPI + PostgreSQL API を組み合わせた、献立生成 MVP です。

## 現在の構成
- Web UI: `src/app`
  - `/profile`
  - `/generate`
  - `/result`
  - `/recipes/[recipeId]`
- Next.js 側 API:
  - `POST /api/users/profile`
  - `GET /api/meta/options`
  - `GET /api/recipes`
  - `GET /api/recipes/{recipeId}`
  - `POST /api/menu/generate`
- FastAPI 側 API:
  - `GET /health`
  - `GET /meta/options`
  - `GET /recipes`
  - `GET /recipes/{recipe_id}`
  - `POST /menu/generate`

Next.js の API ルートは、プロフィール入力のバリデーション以外は FastAPI へのプロキシとして動きます。

## セットアップ

### 1. Python / Node.js
PowerShell:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r requirements.txt
python -m pip install -r app_api\requirements_api.txt
npm install
npx playwright install chromium
```

### 2. 環境変数
`.env.example` をベースに `.env` を作成してください。

最小例:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=recipe_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
APP_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_APP_API_BASE_URL=http://127.0.0.1:8000
```

`APP_API_BASE_URL` / `NEXT_PUBLIC_APP_API_BASE_URL` は未設定でも `http://127.0.0.1:8000` を既定値として使います。

## 手早い確認方法

### 推奨: 検証をまとめて実行
PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_mvp_verification.ps1
```

このスクリプトは以下を順番に実行します。
- テスト用 PostgreSQL 起動
- Python の常時実行テスト
- DB 統合テスト
- `app_api` 統合テスト
- `npm run verify:web`

GitHub Actions の CI でも、同じ検証フローを `-SkipPostgresStartup` 付きで再利用します。

オプション:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_mvp_verification.ps1 -IncludeOptional
powershell -ExecutionPolicy Bypass -File scripts\run_mvp_verification.ps1 -SkipE2E
```

### Web 側だけ確認
```powershell
npm run verify:web
```

これは次を実行します。
- `npm run typecheck`
- `npm run test:e2e:result`

`test:e2e:result` は Playwright で以下を確認します。
- `generate -> result -> recipe detail`
- `profile` 編集からのデフォルト反映
- `menu/generate` 失敗時の UI 表示

## ローカル起動

### 1. テスト用 PostgreSQL
```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_test_postgres.ps1
```

### 2. FastAPI
```powershell
$env:POSTGRES_HOST='127.0.0.1'
$env:POSTGRES_PORT='55432'
$env:POSTGRES_DB='recipe_test_db'
$env:POSTGRES_USER='recipe_test_user'
$env:POSTGRES_PASSWORD='recipe_test_password'

python -m uvicorn app.main:app --reload --app-dir app_api
```

### 3. Next.js
別ターミナル:
```powershell
$env:APP_API_BASE_URL='http://127.0.0.1:8000'
$env:NEXT_PUBLIC_APP_API_BASE_URL='http://127.0.0.1:8000'
npm run dev
```

## テスト実行

### 常時実行セット
```powershell
python -m pytest tests/test_validator_canonical_v1.py tests/test_pipeline_acceptance.py tests/test_pipeline_db_import_acceptance.py -q
```

### DB 統合セット
```powershell
python -m pytest tests/test_option2_db_integration_postgres.py tests/test_pipeline_db_integration_postgres.py -m integration -q
python -m pytest app_api/tests -m integration -q
```

### Web E2E
```powershell
npm run test:e2e:result
```

## Excel ローダー

`load_excel_to_postgres.py` の現在の契約は以下です。
- 正式モード: `skip` / `replace`
- 互換モード: `update`（正式契約外。警告付き）

例:
```powershell
python load_excel_to_postgres.py `
  --excel "recipe_db_main_chicken_100_batch1.xlsx" `
  --host localhost `
  --port 5432 `
  --db-name recipe_db `
  --user postgres `
  --parent-existing-mode replace `
  --report "reports/import_main_chicken.json"
```

詳細:
- `docs/import_recipe_excel_pipeline_usage.md`
- `docs/recipes_loader_formal_spec.md`
- `docs/final_data_contract_spec.md`

## 主要ドキュメント
- API 契約: `docs/api_contract_mvp.md`
- フロント接続: `docs/frontend_api_integration_guide.md`
- テスト方針: `docs/test_execution_matrix.md`
- 実装分解: `docs/implementation_breakdown_plan.md`
