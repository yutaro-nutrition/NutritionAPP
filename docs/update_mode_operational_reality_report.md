# update Mode Operational Reality Report

- Document date: 2026-03-26
- Focus: evidence-based operational reality check for `update` mode
- Scope: repository-internal evidence only (no external systems)

## 1. 文書の目的

- 本確認の目的は、`update` 依存棚卸し（`docs/update_mode_inventory_report.md`）とは別に、`update` が実運用導線で現在使われている証拠が repo 内にあるかを検証すること。
- 本書は「依存の有無」ではなく「運用実態証拠の強さ」を評価する。
- 判断は repo 内証拠に限定し、repo 外（外部CI、運用ジョブ、個人runbook、口頭運用）は断定しない。

## 2. 調査方法と限界

### 2.1 読んだ対象
- 必読:
  - `docs/update_mode_inventory_report.md`
  - `docs/final_data_contract_spec.md`
  - `docs/implementation_breakdown_plan.md`
  - `docs/recipes_loader_formal_spec.md`
  - `docs/import_recipe_excel_pipeline_usage.md`
  - `docs/db_integration_postgres_test_usage.md`
- 追加確認:
  - `README.md`
  - `load_excel_to_postgres.py`
  - `scripts/import_recipe_excel_pipeline.py`
  - `scripts/run_db_import.ps1`, `scripts/run_integration.ps1`, `scripts/run_postgres_copy.ps1`, `scripts/run_validation.ps1`
  - `app_api/scripts/import_integrated_csv.py`
  - `reports/`, `output/` の json/txt/log（実行記録）

### 2.2 検索方法
- `rg` による全文検索（主に `parent-existing-mode`, `update`, `legacy compatibility`, `P106_PARENT_MODE_UPDATE_LEGACY`）
- 運用入口候補（ps1/sh/yml/Makefile/Taskfile/package scripts）への限定検索
- 実行記録候補（`reports/`, `output/`）の `parent_existing_mode` 値確認

### 2.3 使った検索語
- `parent-existing-mode`
- `--parent-existing-mode`
- `update`
- `skip|update`
- `skip / update`
- `skip, update`
- `legacy compatibility`
- `P106_PARENT_MODE_UPDATE_LEGACY`

### 2.4 git履歴確認の可否
- 実施可否: **不可**
- 理由: 実行環境で `git` コマンド自体が利用不可（`The term 'git' is not recognized...`）
- 結論: git履歴は未確認

### 2.5 repo から断定できない範囲
- 外部CI（GitHub Actions等）
- 外部スケジューラ（cron, Airflow, Jenkins等）
- 個人PCでの手動実行履歴
- repo外runbook

## 3. repo 内で確認できた `update` 使用証拠一覧

### 3.0 証拠強度基準（短表）

| 強度 | 基準 |
|---|---|
| Strong | 現在有効な運用入口/ジョブ設定/実行記録として、`update` の指定または実行が直接確認できる |
| Medium | usage・入口コードに `update` 記述があるが、実際の現行運用実行までは断定できない |
| Low | テスト用途・履歴文書・比較資料など、実運用導線とは言い切れない |
| Not evidence | `update` 使用証拠にならない（`skip` 実行記録、導線のみ、対象不在など） |

| ID | ファイルパス | 種別 | 該当内容の要約 | 証拠強度 | 現行運用導線と言えるか | 根拠 | 推奨対応 |
|---|---|---|---|---|---|---|---|
| O-01 | `scripts/import_recipe_excel_pipeline.py:501-509` | script/entrypoint | CLI choices が `skip/replace/update` を受理 | Medium | Unknown | 入口で受理可能だが、このスクリプトを本番運用が実行している証拠は repo 内で未確認 | 外部ジョブで本スクリプト利用有無を確認 |
| O-02 | `load_excel_to_postgres.py:111-119` | script/entrypoint | ローダーCLIが `skip/replace/update` を受理 | Medium | Unknown | 実行可能性の証拠であり、実行実績の証拠ではない | 同上（利用実績確認） |
| O-03 | `README.md:34-36` | docs/example | `--parent-existing-mode skip|update` を案内 | Medium | Unknown | 利用誘導の証拠だが、実運用で使われた証拠ではない | 誤誘導リスクとして別管理（運用実績とは分離） |
| O-04 | `docs/import_recipe_excel_pipeline_usage.md:47-50` | docs/example | `update` を legacy/非推奨として明記 | Medium | Unknown | 記述はあるが、実運用で使っている証拠ではない | 非推奨導線として維持/整理判断 |
| O-05 | `tests/test_pipeline_db_integration_postgres.py:510-545` | test | `update` 互換テスト（親更新・子据え置き） | Low | No | テスト用途と明示コメントあり（legacy behavior verification） | 運用証拠と混同しない |
| O-06 | `docs/db_integration_postgres_test_usage.md:58-61` | docs/test-usage | `update` は「legacy互換確認」と記載 | Low | No | 文書自体が統合テスト手順を対象化 | 運用runbookと区別して管理 |
| O-07 | `reports/dry_run_gohan120_fixed_20260321.json:7` | report/log | `parent_existing_mode` が `"skip"` | Not evidence | No（`update` 実行証拠として） | `update` ではなく `skip` 実行記録 | `update` 使用証拠と混同しない |
| O-08 | `reports/dry_run_main_chicken_formal_loader_20260321.json:7` | report/log | `parent_existing_mode` が `"skip"` | Not evidence | No（`update` 実行証拠として） | 同上 | 同上 |
| O-09 | `reports/import_gohan120_fixed_20260321.json:7` | report/log | 本投入レポートでも `parent_existing_mode` が `"skip"` | Not evidence | No（`update` 実行証拠として） | 同上 | 同上 |
| O-10 | `scripts/run_db_import.ps1:81-88` | job/wrapper | 運用ラッパーは `app_api/scripts/import_integrated_csv.py` を実行 | Not evidence | No（`update` 実行証拠として） | `update` / `--parent-existing-mode` / `parent_existing_mode` の記述なし | `update` 実使用証拠として扱わない |
| O-11 | `app_api/scripts/import_integrated_csv.py:320-329,386-390` | operational script | `--no-truncate` のみ。既定は truncate+reload、`parent-existing-mode` 概念なし | Not evidence | No（`update` 実行証拠として） | `update` 実引数経路の証拠なし | `update` 実行証拠として扱わない |
| O-12 | `output/`, `reports/` 全体検索結果 | negative evidence | `"parent_existing_mode": "update"` は未検出 | Low | Unknown（外部運用は未確認） | repo内記録上は `skip` のみ確認、`update` 実行痕跡は未検出 | repo外実行履歴の追加確認が必要 |
| O-13 | `.github/`, `ci/`, `bin/`, `tools/`, `tasks/` | job config | 対象ディレクトリ自体が存在しない | Not evidence | Unknown | in-repo CI/job 設定を検証できる対象がない | 外部CI設定の人手確認へ |

## 4. 現行運用導線の判定

### A. repo 内で現行運用導線の証拠あり
- 判定件数: 0
- 内容: repo 内で `update` 指定または実行を直接示す現行運用導線は確認できなかった。
- 理由: 運用ラッパーの存在（O-10/O-11）は確認できるが、`update` 実使用証拠にはならないため。

### B. 記述はあるが現行運用か断定不可
- 判定件数: 4（O-01, O-02, O-03, O-04）
- 内容: CLI入口やdocsに `update` 記述はあるが、実行実績・ジョブ紐づけの証拠がない。
- 理由: 「使える/書かれている」と「現在使われている」は別。

### C. テスト・互換・履歴用途
- 判定件数: 3（O-05, O-06, O-12）
- 内容: `update` は互換検証・説明文脈で残存し、記録上は `skip` のみ確認。
- 理由: `update` 実行痕跡を示すログは repo 内で未検出。

### D. repo 内証拠なし（外部確認必要）
- 判定件数: 4カテゴリ（外部CI、外部ジョブ、手動runbook、個人端末実行）
- 内容: repo 内だけでは現行運用での `update` 利用有無を断定できない。
- 理由: 対象設定・ログが repo 外にあるため。

## 5. 既存棚卸しレポートとの関係

- 対応対象: `docs/update_mode_inventory_report.md` の U-01〜U-15。
- 依存はあるが運用証拠が弱い:
  - U-01, U-04（CLI choices）
  - U-09, U-10（docs/example）
- 依存はあるが、repo内の `update` 実行証拠は確認できない:
  - U-04/U-06 は入口として `update` を受理するが、運用ラッパー（O-10, O-11）は `update` 実引数経路を示さない
  - 実行記録は `skip`（O-07〜O-09）で、`update` 痕跡は未検出（O-12）
- repo 内では運用確認できなかった項目:
  - 外部CIジョブで `--parent-existing-mode update` を指定しているか
  - 個別オペレーターの手動実行で `update` を使っているか
- 今回新たに分かったこと:
  - チェックイン済み実行レポートでは `parent_existing_mode` は `skip` のみで、`update` は未検出。

## 10. 再検証結果を踏まえた訂正追補

### 10.1 訂正対象
- 前版で Strong としていた O-07〜O-13 は、`update` 実使用証拠としては過大評価だった。
- 特に O-10（`run_db_import.ps1`）と O-11（`import_integrated_csv.py`）は、`update` 実行証拠ではない。

### 10.2 Strong evidence 評価の見直し
- 再検証結果に基づく見直し:
  - Strong: 0
  - Medium: 0
  - Low: 1（O-12）
  - Not evidence: 6（O-07, O-08, O-09, O-10, O-11, O-13）

### 10.3 repo 内実行証拠に関する現時点の監査結論
- 事実: repo 内には `update` 依存（CLI受理・docs記述・テスト）は残っている。
- 事実: しかし repo 内のチェックイン済み記録では `parent_existing_mode=update` の実行痕跡は確認できていない。
- 結論: 現時点の正確な表現は **「依存あり・repo内実行証拠なし」**。

### 10.4 repo 外確認が必要な事項
- 外部CI、外部ジョブ、手動runbook、個人端末実行は未確認のため、未使用確定はできない。
- よって監査結論の留保は **「外部運用未確認」** を維持する。

## 6. 最も注意すべき運用リスク

1. 外部ジョブ未確認のまま「repo内証拠なし=未使用」と誤判定するリスク。
- 理由: `.github/ci` 不在でも外部CIは存在し得る。

2. README/CLI記述を「実運用中の証拠」と過大解釈するリスク。
- 理由: 記述は導線候補だが、実行実績の裏付けにはならない。

3. テスト用途の `update` を運用用途と混同するリスク。
- 理由: `tests/test_pipeline_db_integration_postgres.py` は互換検証目的であり、本番運用証拠ではない。

4. 逆に「テスト用途だから無害」として運用確認を省略するリスク。
- 理由: 入口CLIは依然 `update` を受理するため、外部ジョブが使っていれば影響は実運用に波及する。

5. repo内実行記録が `skip` のみである事実を、全運用網へ過剰一般化するリスク。
- 理由: 記録対象外の実行経路があり得る。

## 7. 人手確認が必要な質問

### 運用担当向け
1. 現在の定期投入ジョブで `import_recipe_excel_pipeline.py` または `load_excel_to_postgres.py` を直接実行しているものはあるか。
2. その引数に `--parent-existing-mode update` が残っているジョブはあるか。
3. 手動投入runbook（wiki/社内手順書）に `skip|update` 記載が残っていないか。

### 開発責任者向け
4. 現行の「正式運用経路」は `app_api/scripts/import_integrated_csv.py` で確定か。
5. `import_recipe_excel_pipeline.py` は本番運用で許容する入口か、検証・移行用途に限定するか。

### QA向け
6. `update` 互換テスト（`tests/test_pipeline_db_integration_postgres.py`）の終了判定条件は何か。
7. `update` 非使用を示すエビデンス（ジョブ定義、実行ログ）をどの粒度で収集・保管するか。

## 8. 次にやるべきこと

1. 外部ジョブ一覧（CI/CD、cron、運用バッチ）を収集し、`--parent-existing-mode` 使用有無を棚卸しする。
2. 運用標準経路を文書で一意化し、`import_integrated_csv.py` と `pipeline/loader` の役割境界を確定する。
3. 手動runbookとREADMEの差分監査を実施し、現場の参照優先文書を決める。
4. `update` 非使用判定の証拠要件（期間・ログソース・承認者）をQAと合意する。
5. 判定後に `update` 廃止Phase移行可否の意思決定会を設定する。

## 9. 未確定事項

- repo から断定できないこと:
  - 外部CI/スケジューラの実ジョブ引数
  - 個人端末や口頭運用の手動コマンド
- 断定できない理由:
  - 設定・ログが repo 外管理のため
- 追加で確認すべき先:
  - CI管理画面
  - 運用ジョブ定義台帳
  - 運用担当runbook保管先

## 付録A. 検索コマンド案

```powershell
rg -n -S -- "parent-existing-mode|--parent-existing-mode" README.md docs scripts tests
rg -n -S -- "\bupdate\b|legacy compatibility|P106_PARENT_MODE_UPDATE_LEGACY" docs scripts tests
rg -n -F -- '"parent_existing_mode": "update"' reports output
rg -n -F -- '"parent_existing_mode": "skip"' reports output
rg -n -S -e "import_recipe_excel_pipeline.py" -e "load_excel_to_postgres.py" . --glob "*.ps1" --glob "*.yml" --glob "*.yaml" --glob "package.json"
```

git が使える環境での追加例:

```bash
git grep -n "parent-existing-mode"
git log -S "parent-existing-mode" --oneline
git log -G "parent-existing-mode.*update" --oneline
```

## 付録B. 運用確認インタビュー用チェックリスト

- [ ] 外部CIジョブに `--parent-existing-mode` 指定があるか
- [ ] 指定がある場合、`update` が残っていないか
- [ ] 手動runbookの最新版がどこにあるか
- [ ] README と runbook のどちらを現場が一次参照しているか
- [ ] `update` 非使用を証明するログ保管期間は十分か
- [ ] 廃止判定の承認者（運用/開発/QA）が合意済みか
