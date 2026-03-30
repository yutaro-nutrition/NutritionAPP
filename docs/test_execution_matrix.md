# 1. 目的
`docs/test_inventory_audit.md` の棚卸し結果（11 files / 58 collected）を正式採用し、テスト実行方針を `always` / `db_required` / `optional` で固定する。

# 2. 前提
- 基準線は現行 `main` の安定状態を採用する。
- 既存テストコード/本体コードは変更しない。
- marker 追加・変更はしない。
- collect-only は全件成功済み（58 collected）を前提事実とする。

# 3. テスト分類ルール（always / db_required / optional）
- `always`
  - DB不要で、ローカルで常時回す。
  - 失敗時は即停止して原因を先に潰す。
- `db_required`
  - PostgreSQL 前提（接続・テーブル・最低データ）を必要とする。
  - 通常セットから分離し、DB準備後に実行する。
- `optional`
  - 実行コストが高い、または重複確認/スポット確認の位置づけ。
  - リリース前や重点変更時に実行する。

## 3.1 marker 運用方針
- 既存 marker `integration` を DB依存グループの唯一の実行markerとして使う。
- `app_api/tests` では以下を `pytest.mark.integration` 付与対象とする。
  - `test_db_connection.py`
  - `test_recipe_repository.py`
  - `test_menu_api.py`
  - `test_vocabulary_api.py`
- `test_openapi_error_responses.py` は unmarked のまま（optional / 準unit）。

# 4. ファイル別実行マトリクス表
| file | 区分 | 目的 | 前提条件 | 推奨実行コマンド | 実行頻度 | 失敗時の一次切り分け |
|---|---|---|---|---|---|---|
| `tests/test_validator_canonical_v1.py` | always | canonical validator 契約確認（phase順/first_failure） | template/invalid_samples が存在 | `python -m pytest tests/test_validator_canonical_v1.py -q` | 毎回 | `templates/` 欠落、validator JSON出力崩れ |
| `tests/test_pipeline_acceptance.py` | always | pipeline の非DB受入（validate gate） | Python依存、fixture生成可 | `python -m pytest tests/test_pipeline_acceptance.py -q` | 毎回 | pipeline/validator 呼び出し失敗、出力JSON変更 |
| `tests/test_pipeline_db_import_acceptance.py` | always | 疑似DBローダー注入で DB import gate を安全検証 | tmp_path と fake loader 実行可 | `python -m pytest tests/test_pipeline_db_import_acceptance.py -q` | 毎回 | fake loader 引数契約ずれ、CLI引数変更 |
| `tests/test_pipeline_loader_canonical_v1.py` | optional | loader 近接の mixed 検証（amount/unit/weight 等） | pandas/openpyxl、pipeline script | `python -m pytest tests/test_pipeline_loader_canonical_v1.py -q` | 変更時 | loader 仕様変更、受入系との重複差分 |
| `app_api/tests/test_openapi_error_responses.py` | optional | OpenAPI エラースキーマ契約確認 | FastAPI app import 可（DB依存は相対的に低い） | `python -m pytest app_api/tests/test_openapi_error_responses.py -q` | 変更時 | OpenAPI description/schema 変更 |
| `tests/test_option2_db_integration_postgres.py` | db_required | Option2 の実DB契約（列/制約/backfill） | PostgreSQL + `TEST_POSTGRES_*` | `python -m pytest tests/test_option2_db_integration_postgres.py -m integration -q` | DB変更時 | DB未起動、接続設定不一致、schema/migration不整合 |
| `tests/test_pipeline_db_integration_postgres.py` | db_required | pipeline + 実DB統合契約（skip/replace/update含む） | PostgreSQL + `TEST_POSTGRES_*` | `python -m pytest tests/test_pipeline_db_integration_postgres.py -m integration -q` | DB変更時 | DB未起動、schema指定誤り、loader実行失敗 |
| `app_api/tests/test_db_connection.py` | db_required | API層 DB疎通確認 | `POSTGRES_*` 設定、`APP_API_TEST_AUTO_SEED=1`（既定） | `python -m pytest app_api/tests/test_db_connection.py -q` | 変更時 | `check_db_connection()` が False、接続情報不一致 |
| `app_api/tests/test_recipe_repository.py` | db_required | repository の検索/詳細取得契約 | `POSTGRES_*`、自動seedで最小8 recipe | `python -m pytest app_api/tests/test_recipe_repository.py -q` | 変更時 | DB空、テーブル欠落、seed無効化 |
| `app_api/tests/test_menu_api.py` | db_required | menu/recipes API 応答契約 | `POSTGRES_*`、slot別最小seed（staple/main/side/soup 各2） | `python -m pytest app_api/tests/test_menu_api.py -q` | リリース前 | 404増加、栄養条件を満たすseed不足、DB接続不良 |
| `app_api/tests/test_vocabulary_api.py` | db_required | vocabulary/menu正規化契約 | `POSTGRES_*`、scene/meal_type語彙を含む最小seed | `python -m pytest app_api/tests/test_vocabulary_api.py -q` | リリース前 | alias結果差異、seed無効化、DB接続不良 |

# 5. 常時実行セット
- `tests/test_validator_canonical_v1.py`
- `tests/test_pipeline_acceptance.py`
- `tests/test_pipeline_db_import_acceptance.py`

推奨コマンド:
```bash
python -m pytest tests/test_validator_canonical_v1.py tests/test_pipeline_acceptance.py tests/test_pipeline_db_import_acceptance.py -q
```

# 6. DB依存セット
- `tests/test_option2_db_integration_postgres.py`
- `tests/test_pipeline_db_integration_postgres.py`
- `app_api/tests/test_db_connection.py`
- `app_api/tests/test_recipe_repository.py`
- `app_api/tests/test_menu_api.py`
- `app_api/tests/test_vocabulary_api.py`

推奨コマンド（integration marker 側）:
```bash
python -m pytest tests/test_option2_db_integration_postgres.py tests/test_pipeline_db_integration_postgres.py -m integration -q
```

推奨コマンド（app_api 側）:
```bash
python -m pytest app_api/tests/test_db_connection.py app_api/tests/test_recipe_repository.py app_api/tests/test_menu_api.py app_api/tests/test_vocabulary_api.py -q
```

推奨コマンド（marker ベース）:
```bash
python -m pytest app_api/tests -m integration -q
```

# 7. 任意実行セット
- `tests/test_pipeline_loader_canonical_v1.py`
- `app_api/tests/test_openapi_error_responses.py`

理由:
- 前者は acceptance と論点重複があり、常時実行にするとコスト増。
- 後者は OpenAPI 契約として有用だが、機能回帰よりドキュメント契約寄り。

# 8. app_api/tests の扱い
## 8.1 ファイル別位置づけ（固定）
- `test_openapi_error_responses.py`: **準unit（optional）**
  - DB問い合わせを直接目的にしないが、app import 依存はあるため完全unitではない。
- `test_db_connection.py`: **integration（db_required）**
  - DB疎通そのものを検証対象としているため常時セットから除外。
- `test_recipe_repository.py`: **integration（db_required）**
  - `rows > 0` を要求し、DB seed 前提が明確。
- `test_menu_api.py`: **integration寄り mixed（db_required）**
  - TestClient経由でも実データ成立が必要。
- `test_vocabulary_api.py`: **integration寄り mixed（db_required）**
  - `/recipes` `/menu/generate` を叩くためDB状態に依存。

## 8.2 運用判断
- `app_api/tests` 全体を `always` には入れない。
- 実運用では `db_required` として明示分離する。
- 最小seedは `app_api/tests/conftest.py` が自動投入する（`APP_API_TEST_AUTO_SEED=1` 既定）。
- menu生成の再現性は `APP_API_MENU_RANDOM_SEED` で固定する（`app_api/tests/conftest.py` 既定値あり）。
- autoseed競合は `ensure_minimum_seed()` の advisory lock + UPSERT で最低限抑制する。
- seed詳細の正本は `docs/app_api_minimum_seed_spec.md`。

# 9. pipeline系テストの責務境界
- `tests/test_pipeline_loader_canonical_v1.py`
  - **canonical loader責務**: loader近接の項目マッピング/値保持（amount/unit/weight）検証。
- `tests/test_pipeline_acceptance.py`
  - **acceptance責務**: DBなしで pipeline の gate（validation pass/fail）を確認。
- `tests/test_pipeline_db_import_acceptance.py`
  - **疑似DB acceptance責務**: `--import-db` 経路を fake loader で安全に確認（実DB不要）。
- `tests/test_option2_db_integration_postgres.py`
  - **実DB integration責務（Option2）**: 実DBで列制約/backfill含む契約確認。
- `tests/test_pipeline_db_integration_postgres.py`
  - **実DB integration責務（pipeline）**: 実DBで skip/replace/update 互換・原子性確認。

重複している箇所:
- `validation failでDB未実行`、`dry-run`、`idempotent` が疑似DB acceptance と実DB integration の両方に存在。

将来整理対象（今回未実施）:
- acceptance と loader-mixed の重複観点の統合/削減。
- 疑似DBと実DBの重複シナリオの意図的二重化ルール化（残す/削る基準）。

# 10. 標準実行順
1. `always` を先に実行（即時フィードバック）
2. 必要時に `optional` を実行
3. DB準備後に `db_required` を実行

推奨順序:
```bash
python -m pytest tests/test_validator_canonical_v1.py tests/test_pipeline_acceptance.py tests/test_pipeline_db_import_acceptance.py -q
python -m pytest tests/test_pipeline_loader_canonical_v1.py app_api/tests/test_openapi_error_responses.py -q
python -m pytest tests/test_option2_db_integration_postgres.py tests/test_pipeline_db_integration_postgres.py -m integration -q
python -m pytest app_api/tests -m integration -q
python -m pytest app_api/tests -m "not integration" -q
```

# 11. 失敗時の一次切り分け
- `always` 失敗:
  - template/invalid sample の存在
  - pipeline/validator CLI の stdout JSON
- `db_required` 失敗:
  - DB起動状態 (`docker compose ps`)
  - 環境変数 (`TEST_POSTGRES_*`, `POSTGRES_*`)
  - テーブル作成状態 (`create_tables.sql` + migrations)
  - seed不足（特に app_api/repository/menu 系）

# 12. 今後の整理候補
- seed CLI（`app_api/scripts/load_minimum_test_seed.py`）のログ出力/監査性を強化。
- `pipeline_loader_canonical_v1` と `pipeline_acceptance` の責務重複削減。
- root と `scripts/` の二重エントリポイントの正本宣言。
