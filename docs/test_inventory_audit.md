# 1. 目的と前提
- 目的: 現在の安定基準線を固定したまま、テスト資産の全体像（所在、収集可否、実行依存、重複・欠落・曖昧さ）を可視化し、次に着手する修正順を判断可能にする。
- 前提:
  - 作業開始時点の HEAD を基準線として扱う。
  - 実装・テストコード自体の修正は行わない。
  - 依存追加/更新、リファクタリングは行わない。
  - 今回は棚卸しと報告のみ。

# 2. 現在の基準線情報
- branch: `main`
- HEAD(short): `6a36b7c`
- working tree 状態(開始時): clean (`git status --porcelain` が空)
- 確認日時: 2026-03-29 (JST)

# 3. pytest構成の把握
## 3.1 設定ファイル所在
- `pytest.ini` (repo root)
- `tests/conftest.py`
- `app_api/tests/conftest.py`
- `pyproject.toml`: 未検出
- `setup.cfg`: 未検出

## 3.2 marker
- 明示定義:
  - `integration`: `tests/test_option2_db_integration_postgres.py` と `tests/test_pipeline_db_integration_postgres.py` で使用 (`pytestmark = pytest.mark.integration`)
- `python -m pytest --markers` で確認した結果:
  - 独自 marker は `integration` のみ（他は pytest 標準 marker）

## 3.3 fixture（主要）
- `tests/conftest.py`
  - `postgres_test_config` (session): `TEST_POSTGRES_*` の読込（デフォルトあり）
  - `postgres_ready` (session): DB接続確認。接続不可なら `pytest.skip(...)`
  - `postgres_isolated_config` (session): `TEST_POSTGRES_SCHEMA` 未指定時に `it_<uuid>` schema 発行
  - `ensure_test_tables` (session): `create_tables.sql` + `migrations/*.sql` 適用、終了時 schema cleanup
  - `clean_test_tables` (function): `recipes/recipe_ingredients/recipe_steps` truncate
- `app_api/tests/conftest.py`
  - fixture定義なし（`sys.path` 調整と `POSTGRES_DB` デフォルト設定）

## 3.4 collect対象外・skip・xfail
- collect対象外条件:
  - `pytest.ini` に `testpaths` 等の制限なし。pytestデフォルト検出規則（`test_*.py` など）に依存。
  - `tests/fixtures/workbook_factory.py` や `conftest.py` はテスト収集対象外（補助コードとして利用）。
- skip:
  - `tests/conftest.py` の `postgres_ready` にて、PostgreSQL接続不可時に integration 群を skip。
- xfail:
  - 明示 `xfail` は未使用。

## 3.5 unit / integration / acceptance の実態
- `integration` marker 付き: 実DB(PostgreSQL)統合テスト 17件
- markerなしだが実質 acceptance: pipeline受け入れ系（実CLI実行、疑似DB含む）
- app_api/tests は markerなしだが実質的に DB状態依存の統合寄りテストを含む

## 3.6 DB依存・環境変数依存
- 明示 env 依存（`tests/conftest.py`）:
  - `TEST_POSTGRES_HOST`
  - `TEST_POSTGRES_PORT`
  - `TEST_POSTGRES_DB`
  - `TEST_POSTGRES_USER`
  - `TEST_POSTGRES_PASSWORD`
  - `TEST_POSTGRES_SCHEMA` (optional)
- `app_api/tests` は `POSTGRES_*` 系設定と DB実データ存在に実質依存（`SessionLocal`, repository/API経由）

# 4. テスト関連ファイル一覧
## 4.1 テストコード
- `tests/test_validator_canonical_v1.py`
- `tests/test_pipeline_loader_canonical_v1.py`
- `tests/test_pipeline_acceptance.py`
- `tests/test_pipeline_db_import_acceptance.py`
- `tests/test_pipeline_db_integration_postgres.py`
- `tests/test_option2_db_integration_postgres.py`
- `app_api/tests/test_db_connection.py`
- `app_api/tests/test_menu_api.py`
- `app_api/tests/test_openapi_error_responses.py`
- `app_api/tests/test_recipe_repository.py`
- `app_api/tests/test_vocabulary_api.py`

## 4.2 補助コード/fixture
- `tests/conftest.py`
- `app_api/tests/conftest.py`
- `tests/fixtures/workbook_factory.py`
- `tests/fixtures/__init__.py`

## 4.3 docs（test/integration/acceptance/pipeline/postgres関連）
- `docs/pipeline_acceptance_test_usage.md`
- `docs/db_import_acceptance_test_usage.md`
- `docs/db_integration_postgres_test_usage.md`
- `docs/integration_test_baseline_2026-03-29.md`
- `docs/import_recipe_excel_pipeline_usage.md`
- `docs/postgres_load_spec.md`
- `README.md`（`python -m pytest app_api/tests -q` 記載）

## 4.4 scripts（実行補助・周辺）
- `scripts/run_integration.ps1`
- `scripts/run_db_import.ps1`
- `scripts/run_validation.ps1`
- `scripts/run_postgres_copy.ps1`
- `scripts/validation/run_all_validations.py`
- `scripts/integration/load_integrated_to_postgres.py`
- `scripts/integration/postgres_copy_integrated.sql`

# 5. テスト分類表
| ファイルパス | テスト種別 | 主対象 | 実行に必要な依存 | 想定実行コマンド | 収集可否 | 実行可否の見立て | skip/失敗の主要因 | 重複/類似テストの疑い | 優先度 | コメント |
|---|---|---|---|---|---|---|---|---|---|---|
| `tests/test_validator_canonical_v1.py` | unit | validator | 外部ファイル(template/invalid_samples), openpyxl | `python -m pytest tests/test_validator_canonical_v1.py -q` | 可 | 高 | template欠落/validator実行失敗 | `test_pipeline_acceptance.py` のvalidation系と論点重複 | 中 | first_failure/phase順序を詳細検証 |
| `tests/test_pipeline_loader_canonical_v1.py` | mixed | pipeline + loader + 変換処理 | pandas/openpyxl, pipeline script | `python -m pytest tests/test_pipeline_loader_canonical_v1.py -q` | 可 | 中〜高 | スクリプト入出力仕様差異 | `test_pipeline_acceptance.py` とvalidation停止系が類似 | 中 | unit寄り検証と受け入れ観点が同居 |
| `tests/test_pipeline_acceptance.py` | acceptance | pipeline | 外部ファイル(template/invalid_samples) | `python -m pytest tests/test_pipeline_acceptance.py -q` | 可 | 中〜高 | validator/pipeline出力JSON変更 | `test_pipeline_loader_canonical_v1.py` と重複あり | 中 | DB非依存の受け入れ群 |
| `tests/test_pipeline_db_import_acceptance.py` | acceptance | pipeline + 疑似DB loader | tmp_path, pandas/openpyxl, fake loader script | `python -m pytest tests/test_pipeline_db_import_acceptance.py -q` | 可 | 高 | CLI引数仕様変更, fake loader契約差異 | 実DB integration群とシナリオ重複（idempotent/fail-on-warning等） | 中 | 実DB不要で回せるDB投入ゲート検証 |
| `tests/test_pipeline_db_integration_postgres.py` | integration | pipeline + DB integration | PostgreSQL, `TEST_POSTGRES_*`, psycopg, schema/migrations | `python -m pytest tests/test_pipeline_db_integration_postgres.py -m integration -q` | 可 | 環境依存 | PostgreSQL未起動/接続不可で skip、schema不整合 | `test_option2_db_integration_postgres.py` とDB層論点が近い | 高 | `skip/replace/update` の契約確認含む |
| `tests/test_option2_db_integration_postgres.py` | integration | Option2 DB integration | PostgreSQL, `TEST_POSTGRES_*`, psycopg, migration SQL | `python -m pytest tests/test_option2_db_integration_postgres.py -m integration -q` | 可 | 環境依存 | PostgreSQL未起動/接続不可で skip | `test_pipeline_db_integration_postgres.py` と一部重複 | 高 | Option2列/制約/backfill挙動検証 |
| `app_api/tests/test_db_connection.py` | integration | DB connection | app_api依存 + DB接続設定 | `python -m pytest app_api/tests/test_db_connection.py -q` | 可 | 環境依存 | DB疎通不可 | `test_recipe_repository.py` と前提が同じ | 高 | 最小疎通テスト |
| `app_api/tests/test_menu_api.py` | mixed | API(menu/recipes) | FastAPI TestClient, DBデータ | `python -m pytest app_api/tests/test_menu_api.py -q` | 可 | 中（データ依存） | DB未投入/マスタ不足で404や件数期待ずれ | `test_vocabulary_api.py` とAPI契約が近い | 高 | 200/404/422の契約確認 |
| `app_api/tests/test_openapi_error_responses.py` | unit | API(OpenAPI schema) | FastAPI app import | `python -m pytest app_api/tests/test_openapi_error_responses.py -q` | 可 | 中〜高 | OpenAPI定義変更 | `test_menu_api.py` と一部契約観点重複 | 低〜中 | ドキュメント契約テスト |
| `app_api/tests/test_recipe_repository.py` | integration | repository/DB | DB接続 + 実データ存在 | `python -m pytest app_api/tests/test_recipe_repository.py -q` | 可 | 中（データ依存） | DB空/未投入で失敗 | `test_db_connection.py` とDB前提重複 | 高 | `rows > 0` 前提が強い |
| `app_api/tests/test_vocabulary_api.py` | mixed | API vocabulary + menu | FastAPI TestClient, DB/語彙データ | `python -m pytest app_api/tests/test_vocabulary_api.py -q` | 可 | 中（データ依存） | 語彙データ不足、DB依存 | `test_menu_api.py` と重複 | 中 | alias正規化の契約を確認 |

# 6. collect結果の要約
- `python -m pytest --collect-only -q`
  - 結果: `58 tests collected`（収集エラーなし）
- `python -m pytest tests --collect-only -q`
  - 結果: `43 tests collected`
- `python -m pytest app_api/tests --collect-only -q`
  - 結果: `15 tests collected`
- `python -m pytest --collect-only -q -m integration`
  - 結果: `17/58 tests collected (41 deselected)`
- `python -m pytest --collect-only -q -m "not integration"`
  - 結果: `41/58 tests collected (17 deselected)`
- import error / collection error:
  - 今回の collect 範囲では未発生

# 7. 実行依存ごとの整理
## 7.1 依存なしで常時回せる候補
- `tests/test_validator_canonical_v1.py`
- `tests/test_pipeline_loader_canonical_v1.py`
- `tests/test_pipeline_acceptance.py`
- `tests/test_pipeline_db_import_acceptance.py`（疑似DBローダー方式）
- `app_api/tests/test_openapi_error_responses.py`（ただし app import 依存）

## 7.2 PostgreSQL 必須
- `tests/test_option2_db_integration_postgres.py`
- `tests/test_pipeline_db_integration_postgres.py`
- `app_api/tests/test_db_connection.py`
- `app_api/tests/test_recipe_repository.py`
- `app_api/tests/test_menu_api.py`
- `app_api/tests/test_vocabulary_api.py`

## 7.3 docker compose 起動前提（docs上）
- `docs/db_integration_postgres_test_usage.md` は `docker compose up -d postgres_test` を記載
- `docs/integration_test_baseline_2026-03-29.md` は `docker start recipe-postgres-test` の代替手順を記載

## 7.4 fixture / canonical workbook 前提
- `tests/fixtures/workbook_factory.py` を直接/間接利用する受け入れ系
  - `tests/test_pipeline_db_import_acceptance.py`
  - `tests/test_pipeline_db_integration_postgres.py`
  - `tests/test_option2_db_integration_postgres.py`（独自生成関数も併用）

## 7.5 acceptance としてまとめるべき群
- `tests/test_pipeline_acceptance.py`
- `tests/test_pipeline_db_import_acceptance.py`

## 7.6 現状で壊れやすい/実行条件が曖昧な群
- `app_api/tests/*`（DB seed/最小前提が文書化不足）
- 実DB integration群（Docker運用手順が docs 間で二系統）

# 8. 重複・欠落・曖昧さの指摘
1. **pipeline系テストの役割重複**
- `test_pipeline_acceptance.py` と `test_pipeline_loader_canonical_v1.py` が、validation失敗時停止などの論点を重複検証。
- どちらが「受け入れ契約」、どちらが「実装近接(unit/mixed)」か境界が曖昧。

2. **疑似DB acceptance と実DB integration のシナリオ重複**
- `fail_on_warning`, `dry_run`, `idempotent` が両系統に存在。
- 意図的重複か、冗長重複かの整理基準が docs にない。

3. **app_api/tests の前提曖昧**
- `test_recipe_repository.py` は `rows > 0` を前提にし、投入済みデータを仮定。
- どのデータセット/初期化手順を前提にするか明文化不足。

4. **docs 手順の二系統化**
- DB起動手順が `docker compose up -d postgres_test` と `docker start recipe-postgres-test` で分岐。
- 環境別の正規手順が未統一で、再現性判断が人依存になりやすい。

5. **エントリポイントの重複（root と scripts 配下）**
- `import_recipe_excel_pipeline.py`, `validate_recipe_excel.py`, `load_excel_to_postgres.py`, `convert_legacy_recipe_excel.py` が root と `scripts/` に併存。
- テストがどちらの実体を正としているか把握コストが高い（wrapper/実体混在）。

6. **MVP観点の欠落候補**
- API層のテストはあるが、`app_api/tests` での DB隔離（専用schema/fixture）や deterministic seed による再現性保証が弱い。
- 「MVP成立に必要な最小回帰セット」の明示（常時実行セット）が不足。

# 9. 現時点の主要ボトルネック
- ボトルネック1: DB依存テストの実行前提（起動方法・seedデータ）が統一されていない。
- ボトルネック2: acceptance/integration の境界定義が曖昧で、重複コストが高い。
- ボトルネック3: app_api/tests が実データ前提で壊れやすく、CIでの安定運用設計が未固定。
- ボトルネック4: エントリポイント重複（root/scripts）が調査・保守コストを上げている。

# 10. 次にやるべきタスク（優先順位付き）
1. **P0: 実行マトリクスの固定（常時/DB/任意）**
- 目的: テスト群を「毎回回す」「DBがある時だけ回す」に分離し、運用判断を即時化する。
- 今やる理由: 58件は収集できるが、実行可否の判断が人依存で遅い。
- 完了条件: 1つのドキュメントに `always`, `db_required`, `optional` の実行コマンドと前提を明記。
- 注意点: コード変更せず docs のみ更新。

2. **P0: app_api/tests のDB前提を明文化**
- 目的: `app_api/tests` の失敗原因（接続不足/seed不足）を判別可能にする。
- 今やる理由: 収集は通るが、実行時失敗の主要因が不明確。
- 完了条件: 必須環境変数・必要データ投入手順・想定最小件数を docs 化。
- 注意点: 既存テストロジックや閾値は変更しない。

3. **P1: pipeline系の重複テスト方針を定義**
- 目的: `pipeline_acceptance` / `pipeline_loader_canonical_v1` / `pipeline_db_import_acceptance` の責務境界を固定。
- 今やる理由: 似た失敗を複数ファイルで追う状態が続いている。
- 完了条件: 各ファイルの責務（契約/実装近接/疑似DB）を文書で宣言。
- 注意点: 今回は削除・統合せず、方針定義に限定。

4. **P1: DB integration 手順の一本化（compose vs docker start）**
- 目的: 再現性のある起動手順を一意化する。
- 今やる理由: docs間で手順差異があり、環境差トラブルを誘発。
- 完了条件: 標準手順と代替手順の使い分け基準を明記。
- 注意点: 実行環境差を否定せず、条件分岐として記載。

5. **P2: root/scripts 二重エントリポイントの正本定義**
- 目的: テスト対象スクリプトの正本を明確にし、誤参照を防ぐ。
- 今やる理由: 棚卸し時点で読み取りコストが高い。
- 完了条件: どのパスを正式運用/テスト対象とするか docs で宣言。
- 注意点: 実ファイル整理は後続、今回は方針合意のみ。

# 11. 今回変更したファイル一覧
- 作成:
  - `docs/test_inventory_audit.md`
  - `reports/test_inventory_audit/pytest_markers.txt`
  - `reports/test_inventory_audit/collect_all_q.txt`
  - `reports/test_inventory_audit/collect_tests_q.txt`
  - `reports/test_inventory_audit/collect_app_api_tests_q.txt`
  - `reports/test_inventory_audit/collect_m_integration_q.txt`
  - `reports/test_inventory_audit/collect_m_not_integration_q.txt`
  - `reports/test_inventory_audit/collect_by_file.tsv`
  - `reports/test_inventory_audit/test_related_files.txt`

# 12. 実行コマンド一覧
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse --short HEAD`
- `git status --porcelain`
- `Get-ChildItem -Recurse -File -Filter pytest.ini|pyproject.toml|setup.cfg|conftest.py`
- `rg --files tests app_api/tests -g "*.py" -g "!**/__pycache__/**"`
- `rg --files docs` / `rg --files scripts`
- `rg -n "pytest|collect-only|integration|acceptance|postgres|TEST_POSTGRES" ...`
- `python -m pytest --version`
- `python -m pytest --markers`
- `python -m pytest --collect-only -q`
- `python -m pytest tests --collect-only -q`
- `python -m pytest app_api/tests --collect-only -q`
- `python -m pytest --collect-only -q -m integration`
- `python -m pytest --collect-only -q -m "not integration"`
- `Get-Content` による対象テスト/ドキュメント/スクリプトの実体確認

# 13. 結論
- 現在の基準線 (`main` / `6a36b7c`) では、**収集ベースで 58件すべて collect 可能** で、即時の collection break はない。
- 一方で実行面は、**DB依存群（integration + app_apiの一部）と非DB群の境界運用が未固定** で、失敗時の切り分けコストが高い。
- 次フェーズは「テストを増やす/直す」前に、**実行マトリクス・前提条件・責務境界の文書固定**を優先すべき。
