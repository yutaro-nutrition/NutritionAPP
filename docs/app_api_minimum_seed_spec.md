# 1. 目的
`app_api/tests` の DB依存テストを安定実行するため、最小seed要件を固定し、再現可能な投入手順を定義する。

# 2. 対象テスト
- `app_api/tests/test_db_connection.py`
- `app_api/tests/test_recipe_repository.py`
- `app_api/tests/test_menu_api.py`
- `app_api/tests/test_vocabulary_api.py`

# 3. 必要テーブル一覧
- `recipes`
- `recipe_ingredients`
- `recipe_steps`

補足:
- テーブル定義は `app_api/sql/create_tables.sql` を正本とする。
- 必要 migration は `app_api/sql/migrations/*.sql` を適用する。

# 4. 必要な最小データ要件
## 4.1 最小レコード件数（固定）
- `recipes`: 8件
- `recipe_ingredients`: 8件（各 recipe 1行）
- `recipe_steps`: 8件（各 recipe 1行）

## 4.2 固定ID（seedで投入）
- staple: `RICE_TEST_001`, `RICE_TEST_002`
- main: `MAIN_TEST_001`, `MAIN_TEST_002`
- side: `SIDE_TEST_001`, `SIDE_TEST_002`
- soup: `SOUP_TEST_001`, `SOUP_TEST_002`

## 4.3 データ条件
- 各 recipe は `qa_status='passed'`。
- 各 recipe は ingredients/steps を最低1件持つ。
- `tags` には `post_game|試合後` と `pre_game|試合前` 系語彙を含むデータを配置。
- 栄養値は menu API の `target_protein_g`（35/45）を満たせる組合せを保証。

# 5. 各テストが依存するデータの対応表
| テスト | 依存 | 必要条件 |
|---|---|---|
| `test_db_connection.py` | DB接続 | 接続先DBが疎通可能 |
| `test_recipe_repository.py` | `recipes`,`recipe_ingredients`,`recipe_steps` | staple条件で `total>0`、先頭recipeに子テーブル行がある |
| `test_menu_api.py` | slot別 recipe プール | staple/main/side/soup が空でない、かつ pattern 3件を生成可能 |
| `test_vocabulary_api.py` | `/meta/options` + `/recipes` + `/menu/generate` | 語彙aliasで検索可能、menu生成が200を返せる |

# 6. 採用した seed 戦略
採用: **A + B + D（advisory lock 排他 + UPSERT冪等化 + 共通 helper）**

理由:
- 再現性: テスト開始時に毎回同じID群を再投入して状態を固定できる。
- 速度: 最小8 recipe のみ投入で軽量。
- 保守性: seed定義を `app_api/tests/fixtures/minimum_seed.py` に集約。
- 影響最小: API本体や既存assertionを変更しない。
- 運用容易性: `pytest` 実行だけで seed が整う。
- 競合耐性: `pg_advisory_lock` で seed 全体を最小排他し、`ON CONFLICT ... DO UPDATE` で挿入衝突を吸収。

非採用:
- 全量import導線（`scripts/run_db_import.ps1`）は重く、最小seed用途として過剰。

# 7. seed投入手順
## 7.1 自動（推奨）
- `app_api/tests/conftest.py` の session/autouse fixture が自動実行:
  - schema適用（`create_tables.sql` + migrations）
  - 固定ID seed の再投入
  - `APP_API_MENU_RANDOM_SEED` の既定値設定（menu生成結果の再現性確保）

## 7.2 pytest非依存の手動再投入（追加CLI）
- `app_api/scripts/load_minimum_test_seed.py` を実行する。
- 実行内容:
  - schema適用（`create_tables.sql` + migrations）
  - 固定ID minimum seed 再投入
- 実装上の共有:
  - pytest autoseed と同じ `ensure_minimum_seed()` を呼び出す（正本一本化）。
- 安全ガード:
  - DB名 allowlist（既定: `recipe_test_db`）に一致しない場合は停止。
  - `prod` / `production` / `live` を含む危険DB名は停止。

## 7.3 seedを無効化して確認したい場合
- 環境変数 `APP_API_TEST_AUTO_SEED=0` を設定して実行する。

# 8. 実行コマンド例
```bash
# DB起動（標準）
powershell -ExecutionPolicy Bypass -File scripts/start_test_postgres.ps1

# minimum seed 手動再投入（pytest非依存）
set POSTGRES_HOST=127.0.0.1
set POSTGRES_PORT=5432
set POSTGRES_DB=recipe_test_db
set POSTGRES_USER=recipe_test_user
set POSTGRES_PASSWORD=recipe_test_password
python app_api/scripts/load_minimum_test_seed.py

# app_api DB依存テスト（自動seed有効）
set APP_API_TEST_AUTO_SEED=1
set APP_API_MENU_RANDOM_SEED=20260330
python -m pytest app_api/tests/test_db_connection.py app_api/tests/test_recipe_repository.py app_api/tests/test_menu_api.py app_api/tests/test_vocabulary_api.py -q
```

# 9. 既知の制約
- 自動seedは `recipe_test_db` 前提で運用することを推奨（本番DB流用は禁止）。
- seed無効時、既存DBデータに依存して結果が不安定になる。
- `APP_API_MENU_RANDOM_SEED` 未設定時は menu 生成候補の探索順が非決定になる（本番挙動）。
- 本対応は「最低限の競合耐性」であり、pytest並列の完全最適化（速度最適化）までは対象外。
- 起動標準は `scripts/start_test_postgres.ps1`。直接 compose 実行は環境依存で失敗し得る。
- `docker start recipe-postgres-test` は標準失敗時の代替/復旧手順。

# 10. 今後の改善候補
- seed ID/値を JSON 定義に分離し、データ更新差分を見やすくする。
- seed CLI の実行ログを `reports/` 配下へ残すオプション追加。
- menu生成テストの deterministic random 制御を seed更新手順とセットで運用文書化する。
