# 実装分解計画書（正式仕様→実装フェーズ）

- 作成日: 2026-03-26
- 対象仕様: `docs/final_data_contract_spec.md`
- 目的: 固定済み仕様を、実装・migration・pytest追加に直接渡せる実行単位へ分解する

## 1. 文書の目的
本書は、正式仕様（更新契約/栄養SoT/ingredients保持粒度）を実装可能な粒度に分解する計画書である。

本書の位置づけ:
- 実装そのものは行わない
- DDL案、migration段階、契約pytest案、実装順序を固定する
- 次にCodex/開発者が迷わず実装着手できる状態を作る

## 2. 前提と固定済み仕様

### 2.1 事実（現行コード）
- `load_excel_to_postgres.py` は `--parent-existing-mode` が `skip/update` で、`update` は親のみ更新、子はinsert-only（`DO NOTHING`）。
- API検索・レスポンスの栄養参照は `recipes` 栄養列依存（`recipe_repository.py`, `app_api/app/api/mappers.py`）。
- canonicalの `Food_ID`/`Process` はvalidation対象だが、loader互換縮約でDBに落ちない。

### 2.2 固定済み正式仕様（本計画の拘束条件）
- 更新契約: `skip`/`replace` を正式採用、`update` は正式契約外。
- 栄養SoT: MVPは `recipes` 栄養列を正本。
- ingredients粒度: MVPで `Food_ID`/`Process` を保持対象。

### 2.3 未確定事項（実装影響あり）
- 本番標準投入経路（pipeline差分投入 / integrated_csv全量投入）
- `replace` 実行権限・運用プロセス
- `Food_ID` 未入力許容レベル（WARN/ERROR）

### 2.4 実装への影響
- `replace` 実装はローダー契約・CLI引数・統合テストを同時変更する必要がある。
- `Food_ID`/`Process` 保持は DDL + canonical→loader変換 + loader投入 + テストfixtureを同時に変更する必要がある。
- `update` を残したままでも動作はするが、正式契約違反なので警告化→除去の段階移行が必要。

## 3. DDL案

### 3.1 推奨DDL案（MVP最小）
`recipe_ingredients` に列追加する案を推奨する。

追加候補:
- `food_id TEXT NULL`
- `process TEXT NULL`

制約/互換:
- `NULL` 許容（`Food_ID` 未入力許容方針と互換）
- 既存行は自動的にNULLで後方互換
- 既存UNIQUE/FKは変更不要
- 既存クエリへの破壊影響なし

インデックス:
- MVPでは新規インデックスなし（過剰設計回避）
- 将来検索要件が確定した時点で `food_id` / `process` のインデックス追加を検討

### 3.2 代替DDL案
#### 代替案A: 監査別テーブル（例: `recipe_ingredient_audit`）追加
- メリット: API用テーブルを軽量維持しやすい
- デメリット: import同期ロジックが増え、MVPコストが高い

#### 代替案B: JSONBで可変保持
- メリット: 将来列追加に柔軟
- デメリット: 型保証と検索性が下がり、契約テストが複雑

### 3.3 比較
| 案 | MVP実装難易度 | 後方互換 | 将来拡張 | 運用複雑性 |
|---|---|---|---|---|
| 推奨: `recipe_ingredients`列追加 | 低 | 高 | 中〜高 | 低 |
| 監査別テーブル | 中〜高 | 中 | 高 | 高 |
| JSONB保持 | 中 | 中 | 中 | 中 |

### 3.4 MVPで採るべき最小案
- `recipe_ingredients` に `food_id` / `process` をNULL許容で追加。
- 既存データ移行は不要（NULL埋めで互換）。

### 3.5 将来拡張しやすい点
- 同テーブルに `yield_rate_applied` / `retention_rule_applied` 等を段階追加可能。
- または将来時点で監査別テーブルへ分離可能。

### 3.6 推奨理由
- 現行コード差分が最小で、仕様固定済みMVP要件（`Food_ID`/`Process`保持）を満たせるため。

## 4. migration方針

### 4.1 段階分け（推奨）
#### Phase M1: 受け皿先行（非破壊）
- DDLで `food_id` / `process` を追加（NULL許容）。
- 既存ロジックは未変更でも動作維持。

#### Phase M2: 書き込み経路対応
- `import_recipe_excel_pipeline.py` の loader互換生成に `Food_ID` / `Process` を含める。
- `load_excel_to_postgres.py` の列正規化・prepare・INSERT列へ追加。

#### Phase M3: 更新契約の切替
- CLIモードを `skip/replace` 契約へ移行。
- `update` は警告化→無効化（段階的）。

#### Phase M4: docs/test整合
- 仕様ドキュメント・usage更新。
- 契約pytestを追加しCIゲート化。

### 4.2 後方互換性
- DDL先行は後方互換。
- `update` 廃止は一度に削除せず、互換期間を設ける（警告表示と終了コード方針を明示）。
- 既存Excel（`Food_ID`/`Process`なし）も投入可能であることを維持。

### 4.3 `update` 廃止に伴う影響
影響対象:
- `load_excel_to_postgres.py` argparse
- `scripts/import_recipe_excel_pipeline.py` argparse passthrough
- README / `docs/import_recipe_excel_pipeline_usage.md` / `docs/recipes_loader_formal_spec.md`
- `tests/test_pipeline_db_integration_postgres.py` の update依存ケース

### 4.4 ロールアウト手順案
1. DDL適用（M1）
2. import経路拡張（M2）
3. replace実装と契約テスト導入（M3）
4. update警告化/契約外化（M3）
5. updateテストの置換・docs更新（M4）

### 4.5 ロールバック観点
- M1は列追加のみのためロールバック不要（使わなければ無害）。
- M2以降は feature flag / CLI互換期間で段階ロールバック可能にする。
- `replace` はトランザクション原子性によりデータ破損ロールバックを容易化。

### 4.6 注意点
- 本番標準投入経路が未確定のままでは、M2/M3の対象コードがぶれる。
- `replace` 実行権限未定のまま運用投入すると誤上書きリスクがある。

## 5. 契約pytest案

### 5.1 テスト観点一覧
- 更新契約: `skip` 不変、`replace` 親子一体、`replace` 原子性
- 栄養SoT: API/検索が `recipes` 栄養列参照
- 粒度保持: `Food_ID` / `Process` が投入後に保持される
- 整合: replace後に旧child残存なし

### 5.2 追加候補テストケース名
- `test_postgres_parent_existing_mode_skip_keeps_parent_and_children_unchanged`（既存強化）
- `test_postgres_parent_existing_mode_replace_replaces_parent_and_children`
- `test_postgres_replace_is_atomic_on_child_insert_failure`
- `test_recipe_list_filters_use_recipes_nutrition_columns_as_sot`
- `test_pipeline_persists_food_id_and_process_into_recipe_ingredients`
- `test_replace_removes_stale_children_not_present_in_latest_input`

### 5.3 どこに追加するか
- 実DB統合: `tests/test_pipeline_db_integration_postgres.py`
  - `skip`/`replace`/原子性/保持列/旧child除去
- パイプライン受け入れ: `tests/test_pipeline_db_import_acceptance.py`
  - loader互換変換で列が落ちないこと
- リポジトリ層: `app_api/tests` 側（必要時）
  - 栄養SoT参照契約

### 5.4 fixture不足と追加案
現状不足:
- 1レシピ複数ingredient/step差分を作るfixture
- child insert失敗（例: weight<=0）を意図的に起こすfixture
- `Process` 列入りcanonical workbook生成

追加候補:
- `write_canonical_workbook_with_multiple_children()`
- `write_canonical_workbook_with_food_id_process()`
- `write_canonical_workbook_for_replace_failure_case()`

### 5.5 疑似DB / 実DB の役割分担
- 疑似DB（acceptance）: gate制御、loader引数受け渡し、idempotency
- 実DB統合: replace原子性、親子整合、列保持、旧child除去

### 5.6 失敗時に検知したい内容
- 半更新（親だけ更新）
- replace後旧データ残存
- Food_ID/Process消失
- 栄養SoT参照先の逸脱

### 5.7 最小追加セット（MVP）
1. replace親子置換テスト
2. replace原子性テスト
3. Food_ID/Process保持テスト
4. 栄養SoT参照テスト

### 5.8 推奨追加順
1. replace契約（最重要）
2. replace原子性
3. Food_ID/Process保持
4. 栄養SoT

## 6. 実装順序とタスク分解（最重要）

### 6.1 実装順序（安全順）
1. 未確定事項の最小意思決定
2. DDL追加（受け皿）
3. import変換経路の列保持
4. replaceモード実装
5. 契約pytest追加
6. docs/CLI整理（update契約外化）

### 6.2 タスク分解（DoD付き）

| Task ID | タスク名 | 優先度 | 目的 | 依存関係 | 完了条件（DoD） | 担当想定 |
|---|---|---|---|---|---|---|
| T1 | 未確定事項の先行決定 | P0 | 実装ブレ防止 | なし | 投入経路・replace権限・Food_ID許容レベルを決定記録 | docs/owner |
| T2 | MVP DDLドラフト確定 | P0 | `Food_ID`/`Process`受け皿作成 | T1（軽微） | 追加列・NULL方針・互換方針がレビュー承認 | DB |
| T3 | canonical→loader列保持対応 | P0 | 縮約で列消失しない状態にする | T2 | loader互換bookにFood_ID/Processが出力される | import |
| T4 | loader投入対応（INSERT列拡張） | P0 | DBに列保存する | T2,T3 | insert後に`recipe_ingredients`で値確認できる | import/DB |
| T5 | replaceモード実装 | P0 | 正式更新契約を実現 | T4 | 親子一体置換・旧child除去・原子性が動作 | import/DB |
| T6 | 契約pytest追加（skip/replace/atomic） | P0 | 仕様逸脱をCIで検知 | T5 | 新規契約テストが通過し、既存破壊なし | test |
| T7 | SoT/保持列テスト追加 | P1 | 仕様B/Cの回帰防止 | T4,T5 | SoT・保持列テストが通過 | test |
| T8 | update契約外化（警告→除去計画） | P1 | 仕様Aに整合 | T5,T6 | CLI/docs/testからupdate依存を排除 or 移行警告導入 | import/docs/test |
| T9 | ドキュメント整合更新 | P1 | 運用誤解防止 | T8 | README/usage/specが正式仕様と一致 | docs |

### 6.3 タスクごとのリスク
- T3/T4: 列マッピング漏れで再度消失するリスク
- T5: 置換順序不備で部分反映するリスク
- T8: 互換期間設計不足で既存運用を停止させるリスク

### 6.4 レビュー挿入ポイント
- Gate 1: T2完了時（DDLレビュー）
- Gate 2: T5完了時（replace整合/原子性レビュー）
- Gate 3: T8完了時（契約外化レビュー）

## 7. 未確定事項の扱い

### 7.1 実装前に必須決定
- 本番標準投入経路
- `replace` 実行権限
- `Food_ID` 未入力許容レベル

### 7.2 実装並行でよい
- update廃止の互換期間長
- Food_ID/Processの検索インデックス要否

### 7.3 後回し可能
- 歩留まり/残存率の保持方式
- 二層栄養構造の具体実装時期

### 7.4 推奨判断順
1. 投入経路
2. replace権限
3. Food_ID許容レベル
4. update互換期間

## 8. 直近でCodexへ渡せる最小実装タスク候補
- `recipe_ingredients` への `food_id` / `process` 追加DDLと対応migration草案を作成する
- `scripts/import_recipe_excel_pipeline.py` の loader互換生成に `Food_ID` / `Process` を保持する変更を実装する
- `load_excel_to_postgres.py` に `replace` モード（親子一体置換 + 原子性）を実装する
- `tests/test_pipeline_db_integration_postgres.py` に replace契約テスト（置換/原子性/旧child除去）を追加する
- `--parent-existing-mode update` を警告化し、docs/テストを `skip`/`replace` 契約へ更新する

## 9. Decision Summary
- MVP DDLは `recipe_ingredients` への `food_id` / `process` 追加を採用する。
- migrationは「受け皿先行 -> 書込み経路 -> replace契約 -> update契約外化」の段階移行が最安全。
- pytest最小追加セットは `replace置換` / `replace原子性` / `Food_ID&Process保持` / `栄養SoT`。
- 最初の着手は T1〜T3（未確定決定、DDL確定、列保持経路）を推奨。
