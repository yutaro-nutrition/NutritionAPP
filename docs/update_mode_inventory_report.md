# update Mode Dependency Inventory Report

- Document date: 2026-03-26
- Scope: `update` mode dependency inventory only (no implementation change)
- Contract baseline: formal modes are `skip` / `replace`; `update` is legacy compatibility and outside the formal contract.

## 1. 文書の目的

### 1.1 なぜ棚卸しが必要か
- 事実: 正式契約は `skip` / `replace` に固定済みであり、`update` は正式契約外（legacy compatibility）。
- 事実: ただしコード・テスト・文書に `update` 参照が残っている。
- 目的: `update` に依存する箇所を特定し、完全廃止前に必要な意思決定と残作業を明確化する。

### 1.2 今回の位置づけ
- 今回は調査のみ（削除・変更は実施しない）。
- 実装変更、DDL変更、API/UI変更、テスト書換は対象外。

## 2. 調査範囲

### 2.1 読んだ対象（必読）
- `docs/final_data_contract_spec.md`
- `docs/implementation_breakdown_plan.md`
- `docs/recipes_loader_formal_spec.md`
- `docs/import_recipe_excel_pipeline_usage.md`
- `docs/db_integration_postgres_test_usage.md`
- `load_excel_to_postgres.py`
- `scripts/import_recipe_excel_pipeline.py`
- `tests/test_pipeline_db_integration_postgres.py`
- `tests/test_pipeline_db_import_acceptance.py`
- `tests/test_pipeline_acceptance.py`
- `app_api/sql/create_tables.sql`
- `README.md`

### 2.2 追加で確認した対象
- `docs/design_option_comparison_report.md`
- `docs/data_model_review_report.md`
- `docs/data_model_review_evidence_report.md`
- `docs/postgres_load_spec.md`
- `docs/recipe_excel_db_mapping.md`
- `scripts/load_excel_to_postgres.py`
- `import_recipe_excel_pipeline.py`
- `scripts/run_*.ps1`, `docker-compose.yml`, `pytest.ini`（`update` 参照有無確認）

### 2.3 調査対象の種類
- code / script / test / docs / usage example / operation docs

### 2.4 今回対象外
- `node_modules`, `.next`, `output/`, `reports/` 等の生成物・外部依存領域
- 実運用ジョブ実体（CI SaaS設定、外部スケジューラ設定などコード外情報）

## 3. `update` 依存箇所一覧

| ID | ファイルパス | 種別 | 該当内容の要約 | 依存度 | 放置リスク | 推奨対応 |
|---|---|---|---|---|---|---|
| U-01 | `load_excel_to_postgres.py:111-119` | code | CLI choices が `skip/replace/update` を受理 | High | `update` 実行が引き続き可能で、契約外モードが運用で使われる | 廃止Phaseで choices から除去（運用確認後） |
| U-02 | `load_excel_to_postgres.py:430-473,705-721` | code | `skip` 以外は親 `DO UPDATE`。`replace` と `update` が同じ親更新経路を共有し、子は `replace` 時のみ delete+insert | High | 削除時に `replace` を壊す危険（分離せず消すと回帰） | 先に `replace` 専用分岐を明示してから `update` 除去 |
| U-03 | `load_excel_to_postgres.py:645-650` | code | `update` 選択時の警告出力 | Medium | 契約外モードが「警告付きで使える」状態を維持 | 廃止Phaseでエラー化→除去 |
| U-04 | `scripts/import_recipe_excel_pipeline.py:501-509` | script | パイプラインCLIが `skip/replace/update` を受理 | High | 運用入口で `update` 指定が可能 | 廃止Phaseで choices から除去 |
| U-05 | `scripts/import_recipe_excel_pipeline.py:568-581` | script | `update` 警告と `P106_PARENT_MODE_UPDATE_LEGACY` 付与 | Medium | legacy運用を前提にした監視・運用手順が残留 | 段階廃止で warning運用を終了し、無効化仕様へ |
| U-06 | `scripts/import_recipe_excel_pipeline.py:451-454` | script | `--parent-existing-mode` をローダーへ透過渡し | Medium | 上位CLIからの `update` 利用が継続 | U-04/U-01 と同時に廃止 |
| U-07 | `tests/test_pipeline_db_integration_postgres.py:510-545` | test | `update` 互換挙動（親更新・子据え置き）を専用テストで検証 | High | `update` を削除するとテスト失敗。CI運用に直結 | 廃止判定後にテストを互換フェーズ用から削除 |
| U-08 | `tests/test_pipeline_db_import_acceptance.py:44-56` | test | 疑似ローダーが `--parent-existing-mode` 引数を受ける（値制約なし） | Low | 将来 choices変更時に受け入れテスト整合の確認が必要 | 互換削除時に引数契約を最小化 |
| U-09 | `README.md:34-36` | docs / usage example | 主要オプションが `skip|update` のまま（`replace` 不在） | High | 利用者が正式契約と異なる古い使い方を学習 | docs修正優先（実装変更不要） |
| U-10 | `docs/import_recipe_excel_pipeline_usage.md:47-50` | docs | `update` を legacy と明記（非推奨） | Low | 残置自体は契約整合。完全廃止時に文言が古くなる | 廃止Phaseで記述削除 |
| U-11 | `docs/db_integration_postgres_test_usage.md:58-61` | docs / test usage | 実DB統合テスト対象に `update` 互換確認を含む | Medium | 廃止後に手順が不整合化 | 廃止時にテスト手順を `skip/replace` 中心へ更新 |
| U-12 | `docs/recipes_loader_formal_spec.md:22,27,33,76` | docs | `update` を formal contract outside と明記 | Low | 契約としては整合。完全削除後は記述過剰になる | 廃止完了時に履歴節へ移管 or 削除 |
| U-13 | `docs/final_data_contract_spec.md:50-51,64-67,200` | docs (contract) | `update` を「現行事実」と「正式契約外」として明記 | Low | 依存ではなく統制情報。削除しすぎると監査証跡欠落 | 「廃止完了履歴」として維持可能 |
| U-14 | `docs/implementation_breakdown_plan.md:95-113,247` | docs (plan) | `update` 廃止の段階計画と影響範囲を明記 | Low | 実害小。計画文書の陳腐化のみ | 実施後にステータス更新 |
| U-15 | `docs/design_option_comparison_report.md`, `docs/data_model_review_report.md`, `docs/data_model_review_evidence_report.md` | docs (analysis/evidence) | `update` の危険性・比較・証跡を記録 | Low | 履歴文書のため運用誤用は限定的 | 廃止後も「意思決定履歴」として保持 |

補足（見つからなかったもの）:
- `scripts/run_db_import.ps1`, `scripts/run_integration.ps1`, `scripts/run_postgres_copy.ps1`, `scripts/run_validation.ps1`, `docker-compose.yml`, `pytest.ini` に `update`/`parent-existing-mode` 依存は確認できなかった。
- `app_api/sql/create_tables.sql` に `update` モード依存は確認できなかった。

## 4. 依存分類

### 4.1 互換維持のため暫定残置が必要
- 対象: U-01, U-02, U-04, U-05, U-06, U-07
- 理由: 現行実装・入口CLI・互換テストが連動しており、一括即時削除は回帰リスクが高い。
- 今すぐ触るべきか: すぐ削除は非推奨。先に運用依存確認が必要。
- 後回し可否: 短期は可。ただし期限付きで。

### 4.2 すでに正式契約外として整理済み
- 対象: U-10, U-12, U-13, U-14, U-15
- 理由: 「`update` は正式契約外」の明示があり、契約上は整合している。
- 今すぐ触るべきか: 低優先。廃止実施時に整合更新すればよい。
- 後回し可否: 可。

### 4.3 削除候補
- 対象: U-07（互換テスト）, U-10/U-11/U-12 の `update` 実行ガイド記述
- 理由: 完全廃止後は参照が不要になる。
- 今すぐ触るべきか: 廃止判定前は不可。
- 後回し可否: 可（ただし廃止完了時は必須）。

### 4.4 ドキュメント修正だけで足りる
- 対象: U-09（README）
- 理由: 実装を変えずに誤案内リスクを低減可能。
- 今すぐ触るべきか: 高優先（軽作業）。
- 後回し可否: 可能だが誤運用リスクが継続する。

### 4.5 テスト整理が必要
- 対象: U-07, U-08, U-11
- 理由: 廃止時に失敗する/古い手順が残る。
- 今すぐ触るべきか: 廃止計画合意後に着手。
- 後回し可否: 廃止前提なら不可（計画に組み込む必要あり）。

### 4.6 運用手順・ジョブ設定の確認が必要
- 対象: U-01, U-04, U-06（入口）
- 理由: コード外ジョブが `--parent-existing-mode update` を指定している可能性はコードだけでは断定不可。
- 今すぐ触るべきか: 要確認（高優先）。
- 後回し可否: 非推奨。

### 4.7 コード削除前に移行先確定が必要
- 対象: U-02（親更新ロジック共有）
- 理由: `replace` の健全性を保ちながら分離する設計順序が必要。
- 今すぐ触るべきか: 設計確認は今すぐ必要。
- 後回し可否: 不可（最重要ブロッカー）。

## 5. 最も危険な依存（Top 5）

1. `load_excel_to_postgres.py:430-473,705-721`（U-02）
- 危険性: `update` と `replace` の親更新経路共有。乱暴な除去で `replace` 回帰の可能性。
- 削除前の確認: `replace` の親更新SQLと子置換の分離方針、原子性テスト維持。

2. `scripts/import_recipe_excel_pipeline.py:501-509`（U-04）
- 危険性: 運用の主入口で `update` 指定を受け付け続ける。
- 削除前の確認: ジョブ・手順書・自動化で `update` 引数が使われていないこと。

3. `tests/test_pipeline_db_integration_postgres.py:510-545`（U-07）
- 危険性: 廃止時にCI失敗の直接要因。
- 削除前の確認: 互換テスト終了の合意、置換先テスト戦略。

4. `README.md:34-36`（U-09）
- 危険性: 正式契約と逆方向の利用誘導（`replace` が見えない）。
- 削除前の確認: なし（docs更新だけで解消可能）。

5. `load_excel_to_postgres.py:111-119`（U-01）
- 危険性: CLI選択肢として `update` が残る限り、契約外モードへの依存が再生産される。
- 削除前の確認: 互換期間終了判断、運用影響確認。

### 5.1 `update` を warning のまま放置するリスク
- 事実: 正式契約は `skip` / `replace` だが、利用入口のCLI choices（U-01, U-04）では `update` を受理し続ける。
- リスク: 契約文書と実際の利用入口がズレた状態が継続し、誤使用（特に新規運用）が再生産される。
- 事実: docs/test usage に legacy 導線が残存（U-09, U-10, U-11）。
- リスク: 「legacyだが使える」認知が固定化し、廃止判断が先送りされ、互換コスト（警告運用・説明・検証）が固定費化する。
- 事実: `replace` と `update` は親更新経路の共有部を持つ（U-02）。
- リスク: 共有部が長期残置されるほど責務分離が曖昧になり、将来削除時の影響把握・レビュー負荷が上がる。

### 5.2 `update` を即時削除した場合のリスク
- 事実: コード外運用（外部ジョブ、手動runbook）での使用有無は未確定（9章）。
- リスク: 実利用があった場合、即時削除で突発障害（投入失敗・運用停止）を起こす可能性がある。
- 事実: パイプライン入口とローダー入口の双方が `update` を受理している（U-01, U-04, U-06）。
- リスク: CLI choices から同時に除去すると、既存コマンドが一斉に利用不能化する。
- 事実: `replace` と経路共有する実装がある（U-02）。
- リスク: 十分な分離確認なしの削除は `replace` 回帰を誘発しうる。
- 事実: `update` 互換テストが安全網として存在する（U-07）。
- リスク: 実装削除と同時に互換テストを落とすと、移行期の検知能力が低下する。

### 5.3 放置と即時削除の比較（監査結論）
- 監査結論: 放置は契約逸脱の恒常化リスク、即時削除は運用断絶と回帰リスクが高い。
- 推奨: いずれも単独では最適でなく、段階廃止（docs/tests/job/code の順）でリスク分散するのが妥当。

## 6. `update` 廃止ロードマップ案

### 6.1 段階廃止を推奨する理由
- 事実: 依存は code / docs / tests / usage に分散している（3章）。
- 理由: docs / examples / tests / job / code の順で依存を外すと、新規流入抑制と既存影響の切り分けを並行できる。
- 事実: 運用実態（外部ジョブ・手動運用）の一部はコードから断定できない（9章）。
- 理由: 実態確認なしの削除は判断材料不足で、障害時の説明責任を満たしにくい。
- 事実: `replace` 回帰の主要リスクは共有経路（U-02）に集中している。
- 理由: 段階廃止なら `replace` 契約テストを維持しつつ、回帰防止を確認しながら削除できる。
- 理由: 廃止判定条件（未使用期間、ジョブ更新完了、互換テスト終了条件）を事前定義すると、運用・QA・開発の合意形成が容易になる。

### Phase 1: 棚卸し・警告・周知
- 目的: 現存依存の可視化と関係者合意。
- 実施内容: 本棚卸しの確定、利用実態（ジョブ/手動運用）確認、warning方針周知。
- 完了条件: `update` 使用有無が運用単位で確定し、廃止予定日が決定。
- ブロッカー: ジョブ実体情報がコード外にある。
- 判断者: 運用責任者 + データ基盤オーナー。

### Phase 2: docs / examples / tests からの除去（準備）
- 目的: 新規利用を止める。
- 実施内容: README/usage/test usage から `update` 実行推奨を撤去（履歴文書は除外）。
- 完了条件: 実行手順が `skip/replace` のみを案内。
- ブロッカー: 互換期間中にどこまで記載を残すかの合意。
- 判断者: docsオーナー + QAリード。

### Phase 3: 運用依存の除去
- 目的: 本番/検証ジョブの `update` 指定をゼロ化。
- 実施内容: ジョブ定義・バッチ引数・手動Runbookを点検し `skip` または `replace` へ移行。
- 完了条件: 一定期間（例: 2-4週間）`update` 実行実績ゼロ。
- ブロッカー: 外部ジョブ管理基盤へのアクセス権。
- 判断者: 運用責任者。

### Phase 4: CLI choices / 実装からの削除
- 目的: 契約外モードを技術的に無効化。
- 実施内容: CLI choices から `update` 除去、分岐削除、エラーコード設計確定。
- 完了条件: `update` 指定で明示的失敗、`skip/replace` 契約テストが全緑。
- ブロッカー: U-02（`replace` 共通経路分離）。
- 判断者: バックエンド実装オーナー + QA。

### Phase 5: 互換テスト削除
- 目的: 廃止後のテスト体系を正式契約に一本化。
- 実施内容: update互換テスト/文書の整理、回帰監視指標の更新。
- 完了条件: CIに `update` 前提テストが残っていない。
- ブロッカー: 旧互換を要求するステークホルダー有無。
- 判断者: QAリード + プロダクト/運用責任者。

## 7. 実装前に確認すべきこと

- 運用ジョブ:
  - コード外ジョブ（CI/CD、cron、手動バッチ）で `--parent-existing-mode update` が使われていないか。
- 実行者:
  - 誰が `replace` を実行可能か（権限/承認フロー）を文書化済みか。
- docs参照先:
  - 現場が最初に見る文書が README か、`docs/import_recipe_excel_pipeline_usage.md` か。
- テストの互換位置づけ:
  - `update` テストをいつ「歴史的検証」から「削除対象」へ切り替えるか。
- CLI choices削除タイミング:
  - Phase 3 の運用依存ゼロ確認後に限定するか。

## 8. すぐ着手できる軽作業（実装不要）

1. 運用担当に `--parent-existing-mode update` 利用有無を確認するヒアリングシートを配布。
2. README と主要運用手順の現行差分（正式契約 vs 記載）を一覧化。
3. `update` 参照を検知する `rg` コマンドをチーム標準として共有。
4. `update` 廃止判定会議のチェック項目（ジョブ・テスト・docs）を事前配布。
5. 互換テスト終了条件（何週間未使用で削除可とするか）を合意案化。

## 9. 未確定事項

### 9.1 コードから断定できないこと
- 実運用ジョブが現在 `update` を使っているか。
- 手動運用（個人runbook/メモ）で `update` が残っているか。

### 9.2 運用側判断が必要なこと
- `update` 互換期間の終了日。
- `replace` 実行権限と承認フロー。
- 互換テストを削除する判定基準（未使用期間、影響範囲）。

### 9.3 未確定である理由
- これらはコードリポジトリ外の運用情報に依存し、静的調査だけでは確証を持てないため。

## 付録A. 検索コマンド案

```powershell
rg -n -S -- "--parent-existing-mode" README.md docs scripts tests load_excel_to_postgres.py
rg -n -S -- "\\bupdate\\b|legacy compatibility|formal contract outside" docs scripts tests load_excel_to_postgres.py
rg -n -S -- "P106_PARENT_MODE_UPDATE_LEGACY" scripts tests
rg -n -S -- "skip\|update|skip/update" docs README.md
```

## 付録B. `update` 廃止判定チェックリスト

- [ ] 直近運用で `--parent-existing-mode update` 実行実績がない
- [ ] ジョブ定義・runbookから `update` が削除済み
- [ ] README/usage docs が `skip/replace` のみを推奨
- [ ] `replace` 原子性テストが安定稼働
- [ ] `update` 互換テスト削除に関するQA合意がある
- [ ] CLIで `update` 指定時の扱い（エラー仕様）が決定済み
