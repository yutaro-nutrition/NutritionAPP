# update Mode Operational Reality Verification Report

- Document date: 2026-03-27
- Type: focused verification pass (5-point recheck)
- Scope: repository-internal evidence only

## 1. 文書の目的

- 既存 `docs/update_mode_operational_reality_report.md` の結論について、指定5論点の根拠強度を再検証する。
- 特に「運用導線がある」ことと「`update` が実際に指定・実行された」ことの混同を排除する。
- 今回は妥当性確認のみであり、実装変更・既存docs改稿は行わない。

## 2. 調査方法

### 2.1 読んだ対象
- `docs/update_mode_operational_reality_report.md`
- `docs/update_mode_inventory_report.md`
- `scripts/run_db_import.ps1`
- `app_api/scripts/import_integrated_csv.py`
- `scripts/import_recipe_excel_pipeline.py`
- `load_excel_to_postgres.py`
- `README.md`
- `tests/test_pipeline_db_integration_postgres.py`
- `reports/`, `output/`（チェックイン済み記録）

### 2.2 検索語
- `parent-existing-mode`
- `--parent-existing-mode`
- `parent_existing_mode`
- `"parent_existing_mode"`
- `update`
- `P106_PARENT_MODE_UPDATE_LEGACY`
- `legacy compatibility`
- `skip|update`, `skip / update`, `skip, update`

### 2.3 検索対象
- `scripts/`, `app_api/`, `docs/`, `tests/`, `reports/`, `output/`, `README.md`

### 2.4 ログ確認対象
- `reports/*.json`
- `output/` 配下の text/json/log（`parent_existing_mode` / `P106` / `update` 実行痕跡）

### 2.5 git 履歴確認
- 実施: 試行したが **実施不可**
- 理由: `git` コマンド非利用（`The term 'git' is not recognized...`）

## 3. 5つの確認事項の検証結果

### 3.1 `scripts/run_db_import.ps1`
- 対象: `run_db_import.ps1` が `update` を明示指定しているか
- 確認したファイル: `scripts/run_db_import.ps1`
- 見つかった証拠:
  - `app_api/scripts/import_integrated_csv.py` を実行する記述（`scripts/run_db_import.ps1:81-88`）
- 見つからなかった証拠:
  - `update` 文字列
  - `--parent-existing-mode`
  - `parent_existing_mode`
  - `--parent-existing-mode update` の組み立て
- 判定: **`update` 使用証拠なし**
- 根拠: ファイル内の該当文字列ヒットがゼロで、引数構築も存在しない
- 既存レポート結論: **格下げ**（`update` 証拠としては不成立）

### 3.2 `app_api/scripts/import_integrated_csv.py`
- 対象: `update` 実引数受理の有無
- 確認したファイル: `app_api/scripts/import_integrated_csv.py`
- 見つかった証拠:
  - `--no-truncate` のみ（`app_api/scripts/import_integrated_csv.py:320-329`）
  - truncate+reload 実行（`app_api/scripts/import_integrated_csv.py:386-390`）
- 見つからなかった証拠:
  - `parent-existing-mode`
  - `parent_existing_mode`
  - `update` を受理する引数や分岐
- 判定: **`update` 実引数経路の証拠なし**
- 根拠: 該当キー/引数定義がコード上に存在しない
- 既存レポート結論: **格下げ**（`update` 関連Strongには不適）

### 3.3 Strong 7件の再格付け

#### 再判定基準（今回適用）
| 区分 | 基準 |
|---|---|
| Strong | 現在の job/wrapper/runbook/実行ログで `update` 指定または実行が確認できる |
| Medium | `update` を受理・案内するが、実行痕跡はない |
| Low | テスト・履歴・非推奨説明などに限定 |
| Not evidence | `update` 使用証拠にならない（非使用証拠や単なる導線） |

| ID | 既存判定 | 再判定 | 証拠要約 | 判定理由 |
|---|---|---|---|---|
| O-07 | Strong | Not evidence | `parent_existing_mode: "skip"` の記録 | `update` 実行証拠ではなく、`skip` 実行記録 |
| O-08 | Strong | Not evidence | 同上 | 同上 |
| O-09 | Strong | Not evidence | 同上（success時もskip） | 同上 |
| O-10 | Strong | Not evidence | `run_db_import.ps1` は `import_integrated_csv.py` 呼出 | 運用導線証拠ではあるが `update` 指定証拠ではない |
| O-11 | Strong | Not evidence | `import_integrated_csv.py` は `--no-truncate` のみ | `update` 受理/実行の証拠なし |
| O-12 | Strong | Low | `"parent_existing_mode": "update"` 未検出 | 負の証拠として有用だが、`update` 使用証拠ではない |
| O-13 | Strong | Not evidence | `.github/ci/...` ディレクトリ不在 | 不在は `update` 使用証拠にならない |

再集計（Strong 7件の範囲のみ）:
- Strong: 0
- Medium: 0
- Low: 1
- Not evidence: 6

### 3.4 チェックイン済みログの実行痕跡
- 対象: `reports/`, `output/` の実行痕跡
- 確認した証跡:
  - `reports/dry_run_main_chicken_formal_loader_20260321.json:7` -> `"parent_existing_mode": "skip"`
  - `reports/dry_run_gohan120_fixed_20260321.json:7` -> `"parent_existing_mode": "skip"`
  - `reports/import_gohan120_fixed_20260321.json:7` -> `"parent_existing_mode": "skip"`
- 見つからなかった証拠:
  - `"parent_existing_mode": "update"`
  - `--parent-existing-mode update`
  - `P106_PARENT_MODE_UPDATE_LEGACY`
- 判定: **repo内チェックイン済み記録には `update` 実行痕跡なし**
- 既存レポート結論: **維持（ただし「update使用証拠」ではなく「未検出証拠」）**

### 3.5 git 履歴未確認の扱い
- 対象: git履歴により時系列裏取りできるか
- 実施結果: `git grep`, `git log -S` を試行したが、`git` コマンドが利用不可
- 判定: **保留（時系列根拠は未取得）**
- 監査上の扱い:
  - 現在の結論は「現行ワークツリー証拠」に限定
  - 「過去に使われていたか」の時系列断定は弱い
- 既存レポート結論: **維持（穴あり明記）**

## 4. 監査上の修正結論

### 維持できる結論
- repo内チェックイン済み記録で `parent_existing_mode` は `skip` が確認され、`update` 実行痕跡は未検出。
- `update` 実行有無は repo 外運用を確認しない限り断定不可。

### 格下げすべき結論
- 既存レポートの Strong 7件は過大評価。
- 特に O-10/O-11 は「運用導線の存在」証拠であり、「`update` 使用証拠」ではない。
- O-07/O-08/O-09 は `skip` 実行記録であって `update` 実行証拠ではない。

### 保留にすべき結論
- `update` の過去利用有無（git履歴・外部ジョブログ未確認のため）。

### 「現行運用導線の証拠あり 2件」の扱い
- 判定: **部分維持 / 用語修正が必要**
- 理由: 2件（O-10, O-11）は「運用導線証拠」としては有効だが、「`update` 使用証拠」としては無効。

## 5. 最も重要な結論

1. `scripts/run_db_import.ps1` は `update` 明示指定の証拠にならない。  
2. `app_api/scripts/import_integrated_csv.py` に `update` 実引数経路は見当たらない。  
3. Strong 7件は再検証で Strong 0件へ格下げが妥当（Not evidence 6件、Low 1件）。  
4. チェックイン済み実行記録に `parent_existing_mode=update` は見つからなかった。  
5. git履歴未確認により、時系列（過去利用有無）に関する結論は弱い。  

## 6. 未確定事項

- repo から断定できないこと:
  - 外部CI・外部ジョブ・手動runbookでの `update` 実使用
  - 過去コミット時点での `update` 利用状況
- 断定できない理由:
  - repo外管理領域と git履歴へのアクセス制約
- 追加確認先:
  - 運用ジョブ管理画面
  - CI設定管理画面
  - 手動runbook保管先
  - git利用可能な環境での履歴監査

## 7. 次にやるべきこと

1. 外部ジョブ定義で `--parent-existing-mode` 引数を全件抽出し、`update` 有無を確認する。  
2. 運用担当に手動runbook最新版を提出してもらい、`skip|update` 記載を監査する。  
3. git利用可能環境で `git log -S/G` による時系列監査を実施する。  
4. 監査報告書の用語を「update使用証拠」と「非使用/導線証拠」に分離して承認する。  
5. 上記確認後に、`update` 廃止判断のエビデンス十分性を再判定する。  

## 付録A. 実行した検索コマンド

```powershell
Select-String -Path scripts/run_db_import.ps1 -Pattern 'update','parent-existing-mode','parent_existing_mode','--parent-existing-mode'
Select-String -Path app_api/scripts/import_integrated_csv.py -Pattern 'update','parent-existing-mode','parent_existing_mode','--parent-existing-mode'
Select-String -Path scripts/import_recipe_excel_pipeline.py,load_excel_to_postgres.py -Pattern '--parent-existing-mode','parent_existing_mode','P106_PARENT_MODE_UPDATE_LEGACY','legacy compatibility'
rg -n -F -- '"parent_existing_mode": "update"' reports output
rg -n -F -- 'P106_PARENT_MODE_UPDATE_LEGACY' reports output
rg -n -F -- '"parent_existing_mode": "skip"' reports output
rg -n -F -- 'update' tests/test_pipeline_db_integration_postgres.py
```

git（試行したが実行不可）:

```powershell
git grep -n "parent-existing-mode"
git grep -n "\bupdate\b"
git log -S "parent-existing-mode" --oneline --all
git log -S "parent_existing_mode" --oneline --all
git log -S "update" --oneline --all -- scripts/ app_api/ docs/ tests/
```
