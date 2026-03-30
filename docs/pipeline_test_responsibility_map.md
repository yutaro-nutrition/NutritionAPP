# 1. 目的
pipeline系テストの重複を、単なる件数ではなく「担保している層」で分解し、残す重複と将来整理する重複の基準を固定する。

# 2. 対象テスト一覧
- `tests/test_pipeline_loader_canonical_v1.py`
- `tests/test_pipeline_acceptance.py`
- `tests/test_pipeline_db_import_acceptance.py`
- `tests/test_option2_db_integration_postgres.py`
- `tests/test_pipeline_db_integration_postgres.py`

# 2.1 名称と責務のズレ（現状）
| 現在名 | 実際の責務 | ズレ評価 | 誤解ポイント |
|---|---|---|---|
| `test_pipeline_loader_canonical_v1.py` | loader近接 + gate混在 | 大 | loader単体に見えるが gateケースが含まれる |
| `test_pipeline_acceptance.py` | 非DB gate | 小 | 概ね一致 |
| `test_pipeline_db_import_acceptance.py` | 疑似DB import受入 | 小 | `integration` と混同される余地はある |
| `test_option2_db_integration_postgres.py` | Option2固有 実DB契約 | 小 | Option2固有である点は伝わる |
| `test_pipeline_db_integration_postgres.py` | pipeline実DB運用契約 | 小 | `db_import_acceptance` との差が初見では曖昧 |

# 3. 各テストの責務分解
| test file | 主目的 | 入力 | 依存 | 保証内容 | 検知できる異常層 | 重なる相手 | 重なり評価 |
|---|---|---|---|---|---|---|---|
| `test_pipeline_loader_canonical_v1.py` | canonical/invalid sample を使った pipeline入口の停止条件確認 + loader変換仕様（amount/unit/weight）確認 | canonical template, invalid_samples, テスト内生成xlsx | pandas/openpyxl, `import_recipe_excel_pipeline.py`, `load_excel_to_postgres.py` | validation fail時停止、first_failure保持、loaderの amount_value/unit/weight_g 変換規則 | validator層, pipeline CLI層, loader変換層 | `test_pipeline_acceptance.py`, `test_pipeline_db_import_acceptance.py` | **境界曖昧**（入口gateとloader仕様が同居） |
| `test_pipeline_acceptance.py` | DBなしで pipeline受入gateを確認 | canonical template, invalid_samples | `import_recipe_excel_pipeline.py` (JSON出力) | pass/fail判定、error_class分類（STRUCTURE/VALUE/UNIQUENESS） | validator層, pipeline CLI層 | `test_pipeline_loader_canonical_v1.py` | **必要重複あり**（受入gate）+ 一部は整理候補 |
| `test_pipeline_db_import_acceptance.py` | `--import-db` 経路を疑似DB loaderで検証（実DB不要） | canonical workbook factory, fake loader script, fake state file | pipeline CLI, fake loader, pandas/openpyxl | validation fail時にDB import未実行、dry-run/idempotentの入出力契約、loader workbookへの列保持 | pipeline orchestration層（DB import呼び出し契約） | `test_pipeline_db_integration_postgres.py`, `test_option2_db_integration_postgres.py` | **必要重複**（疑似層で高速担保） |
| `test_option2_db_integration_postgres.py` | Option2スキーマ/制約/backfillを実DBで確認 | canonical/invalid excel, migration SQL, DB直接SQL | PostgreSQL, psycopg, migration適用 | `amount_value/unit/weight_g` 列・制約、g/mlの保存挙動、migration backfill、validation fail時DB未更新 | 実DB schema/DDL/migration層 + import最小統合 | `test_pipeline_db_integration_postgres.py`, `test_pipeline_db_import_acceptance.py` | **必要重複あり**（Option2固有） |
| `test_pipeline_db_integration_postgres.py` | pipeline + real DB の運用契約確認（parent mode/原子性/rollback） | canonical workbook factory, 書き換えxlsx, DBトリガー注入 | PostgreSQL, psycopg, pipeline CLI | normal import, fail-on-warning, dry-run/idempotent, `skip/update/replace`, replace失敗時rollback, food/process永続化 | 実DB transaction/整合性/更新モード層 | `test_pipeline_db_import_acceptance.py`, `test_option2_db_integration_postgres.py` | **必要重複あり**（本命の実DB契約） |

# 4. テスト層マップ
- loader単体近接層:
  - `test_pipeline_loader_canonical_v1.py` の loader変換系（amount/unit/weight）
- 非DB acceptance gate層:
  - `test_pipeline_acceptance.py`
- 疑似DB acceptance層（オーケストレーション契約）:
  - `test_pipeline_db_import_acceptance.py`
- 実DB integration層（Option2 schema/migration）:
  - `test_option2_db_integration_postgres.py`
- 実DB integration層（pipeline運用契約・原子性）:
  - `test_pipeline_db_integration_postgres.py`

# 5. 重複の分類
## 5.1 必要な重複（残す）
- `validation fail -> DB import未実行`
  - 疑似DB acceptance (`test_pipeline_db_import_acceptance.py`) と実DB integration (`test_pipeline_db_integration_postgres.py` / `test_option2_db_integration_postgres.py`) の両方で保持。
  - 理由: オーケストレーション契約と実DB副作用なしを別層で検証しているため。
- `dry-run` / `idempotent`
  - 疑似DBと実DBの両方で保持。
  - 理由: fake loaderで引数/レポート契約、実DBでトランザクション結果を別々に担保しているため。

## 5.2 境界が曖昧な重複（整理候補）
- `test_pipeline_loader_canonical_v1.py` と `test_pipeline_acceptance.py` の validation失敗シナリオ群。
  - 現状: どちらも invalid_samples を使って gate停止を確認。
  - 問題: loader仕様確認と acceptance gate確認が同一ファイルに混在し、責務名と実体がずれている。

## 5.3 不要な重複（将来削減候補）
- `test_pipeline_loader_canonical_v1.py` 内で、loader変換仕様に関与しない gate系ケース。
  - 条件一致で `test_pipeline_acceptance.py` が同等担保している部分は将来削減候補。
  - ただし現時点では未削除（次節の条件を満たすまで維持）。

# 6. 残す重複 / 整理対象重複
## 6.1 残す重複
- 疑似DB acceptance vs 実DB integration の重複（階層差があるため）。
- Option2 integration vs pipeline integration の重複のうち、Option2固有（列/制約/backfill）部分。

## 6.2 整理対象重複
- `test_pipeline_loader_canonical_v1.py` の gate系（validation停止中心）と `test_pipeline_acceptance.py` の重複。
- `test_option2_db_integration_postgres.py` の「一般的 gate確認」部分のうち、Option2固有でないもの。

# 7. 今後の削減方針
1. まず名称/責務を明確化し、削減は第2段階で行う。
2. 削減してよい条件を満たしたケースのみ削る。
- 同一入力種別（canonical/invalid）
- 同一期待（return code, error code/class, db_import_executed）
- 同一層を検証していること（層差がない）
- 片方を削っても、別層テストで同種回帰を検知できること
3. Option2固有担保（migration/制約/backfill）は削減対象にしない。
4. `skip/update/replace` と rollback 原子性は `test_pipeline_db_integration_postgres.py` を正本として維持する。

# 7.1 名称・分類明確化の今回方針
- 採用: **A + D（docs責務ラベル強化 + テストファイル先頭ラベル）**
- 非採用: ファイル rename / ディレクトリ再配置
  - 理由: 既存実行導線と docs 参照への影響が大きく、削減計画前の段階ではコストに対して効果が小さいため。
- 追加実施:
  - 対象5ファイルの先頭に `Responsibility label` を明記し、ファイルを開いた瞬間の判別性を上げた。

# 8. 今すぐ削除しない理由
- 現在の重複には「層が違うため必要な重複」が多く、先に削ると回帰検知力が落ちる。
- `test_pipeline_loader_canonical_v1.py` は重複を含むが、loader変換仕様の実質的な担保が同居しているため、切り分け前の削除は危険。
- 実DB integration は運用契約の最後の防波堤であり、疑似DB acceptance だけでは置換できない。

# 9. 次に触るならどこからか
1. `test_pipeline_loader_canonical_v1.py` を「loader変換仕様」と「pipeline gate重複」にラベル分解する（削除はまだしない）。
2. `test_pipeline_acceptance.py` を非DB gateの正本に固定し、重複ケースの受け皿を明示する。
3. `test_option2_db_integration_postgres.py` から Option2非固有ケースを棚卸しし、pipeline integration側へ寄せる候補リストを作る。

# 10. 結論
- pipeline系の重複は「不要な重複」より「層差による必要重複」が主。
- 直近は削除ではなく、責務名と境界の固定を先行する。
- 実行順としては、非DB acceptance（速い）→疑似DB acceptance（契約）→実DB integration（最終担保）を維持しつつ、loader混在ケースのみ段階的に整理する。
