# 1. 目的
pipeline系テストを削減する前段として、テスト関数単位で「保持必須 / 移管候補 / 将来削減候補 / 今は触らない」を具体化し、回帰検知力を落としにくい実削減計画の土台を作る。

# 2. 判定前提
- 判定正本: `docs/pipeline_test_responsibility_map.md`
- 実行分類前提: `docs/test_execution_matrix.md`
- 今回は assertion 意味を変更しない。
- 今回は削除/大規模統合を実施しない。
- 削減候補化は次の3条件を満たす場合のみ近づける。
  - 同一層
  - 同一入力性質
  - 同一期待

# 3. 削減判定ルール
## 3.1 保持必須
- 実DB運用契約（rollback/atomicity/parent mode）
- Option2固有（schema/constraint/backfill）
- loader固有変換（amount/unit/weight）
- fake-db でのみ高速に担保できる orchestration 契約

## 3.2 移管候補
- 現在ファイルの主責務とズレるが、テスト意義は維持したいケース。
- 例: loader_mixed 内の gate 検証を non-DB acceptance 正本へ寄せる。

## 3.3 将来削減候補
- 移管完了後、同一層/同一期待の二重担保が残るケース。
- 先に移管受け皿を作り、片側が冗長になった後のみ対象化。

## 3.4 今は触らない
- 運用方針や仕様判断（legacy互換など）が未確定で、先に削ると監査性を失うケース。

# 4. テストケース一覧
| file | test function | label | layer | duplicate_with | decision | reason |
|---|---|---|---|---|---|---|
| `tests/test_pipeline_loader_canonical_v1.py` | `test_pipeline_accepts_canonical_template_as_valid_structure` | `pipeline_loader_mixed_gate` | non-db gate | `test_pipeline_acceptance::test_pipeline_accepts_canonical_template` | 移管候補 | gate正本は acceptance 側に寄せる方が責務整合 |
| `tests/test_pipeline_loader_canonical_v1.py` | `test_pipeline_stops_on_invalid_sheet_name_and_keeps_first_failure` | `pipeline_loader_mixed_gate` | non-db gate | `test_pipeline_acceptance::test_pipeline_blocks_on_structure_error_invalid_sheet_name` | 移管候補 | gate重複。first_failure確認は acceptance 側へ移せる |
| `tests/test_pipeline_loader_canonical_v1.py` | `test_pipeline_stops_on_required_invalid_samples` | `pipeline_loader_mixed_gate` | non-db gate | `tests/test_pipeline_acceptance.py::test_pipeline_blocks_on_required_invalid_samples` | 実施済み（移管完了） | Prompt 12 で acceptance 側へ移管し、元位置から削減済み |
| `tests/test_pipeline_loader_canonical_v1.py` | `test_pipeline_does_not_call_db_loader_when_phase1_fails` | `pipeline_loader_mixed_gate` | pipeline orchestration (non-db) | `test_pipeline_db_import_acceptance::test_pipeline_blocks_db_import_on_validation_fail` | 将来削減候補 | fake-db acceptance で同層同期待を既に担保。移管後に削減候補 |
| `tests/test_pipeline_loader_canonical_v1.py` | `test_loader_reads_canonical_sheets_and_maps_amount_value_unit` | `pipeline_loader_mixed_gate` | loader transform | 近似なし | 保持必須 | loader変換仕様の固有担保 |
| `tests/test_pipeline_loader_canonical_v1.py` | `test_loader_sets_weight_g_only_for_unit_g` | `pipeline_loader_mixed_gate` | loader transform | 近似は `test_option2_g_unit...`（層差あり） | 保持必須 | loader段の変換規則であり実DB検証と別層 |
| `tests/test_pipeline_loader_canonical_v1.py` | `test_loader_does_not_do_1to1_ml_to_g_for_shoyu` | `pipeline_loader_mixed_gate` | loader transform | 近似は `test_option2_ml_unit...`（層差あり） | 保持必須 | 密度推定しない変換ルールの固有担保 |
| `tests/test_pipeline_acceptance.py` | `test_pipeline_accepts_canonical_template` | `pipeline_acceptance_gate_non_db` | non-db gate | loader_mixed 先頭ケース | 保持必須 | non-DB gate正本として維持 |
| `tests/test_pipeline_acceptance.py` | `test_pipeline_blocks_on_structure_error_invalid_sheet_name` | `pipeline_acceptance_gate_non_db` | non-db gate | loader_mixed invalid_sheet | 保持必須 | 構造エラー分類の正本 |
| `tests/test_pipeline_acceptance.py` | `test_pipeline_blocks_on_structure_error_missing_recipe_column` | `pipeline_acceptance_gate_non_db` | non-db gate | loader_mixed invalid_samples群 | 保持必須 | 必須列欠落の独立確認 |
| `tests/test_pipeline_acceptance.py` | `test_pipeline_blocks_on_value_error_invalid_bad_unit` | `pipeline_acceptance_gate_non_db` | non-db gate | loader_mixed invalid_samples群 | 保持必須 | VALUE_ERROR分類の明示担保 |
| `tests/test_pipeline_acceptance.py` | `test_pipeline_blocks_on_required_invalid_samples` | `pipeline_acceptance_gate_non_db` | non-db gate | 旧: `test_pipeline_loader_canonical_v1.py::test_pipeline_stops_on_required_invalid_samples` | 保持必須（移管受皿） | invalid sample一括gate確認の受け皿として維持 |
| `tests/test_pipeline_acceptance.py` | `test_pipeline_blocks_on_uniqueness_error_samples` | `pipeline_acceptance_gate_non_db` | non-db gate | loader_mixed invalid_samples群 | 保持必須 | UNIQUENESS_ERROR分類の正本 |
| `tests/test_pipeline_db_import_acceptance.py` | `test_pipeline_imports_to_db_only_when_validation_passes` | `pipeline_db_import_acceptance_fake_db` | fake-db orchestration | `test_postgres_normal_import_only_after_validation_passes`（層差） | 保持必須 | 実DB不要で import経路契約を高速担保 |
| `tests/test_pipeline_db_import_acceptance.py` | `test_pipeline_loader_workbook_keeps_food_id_and_process` | `pipeline_db_import_acceptance_fake_db` | loader-compat artifact | `test_postgres_persists_food_id...`（層差） | 保持必須 | loader互換ブック生成契約の固有担保 |
| `tests/test_pipeline_db_import_acceptance.py` | `test_pipeline_blocks_db_import_on_validation_fail` | `pipeline_db_import_acceptance_fake_db` | fake-db orchestration | loader_mixed db_loader_not_called / real-db gate fail系 | 保持必須 | fake-db層の停止契約を明示 |
| `tests/test_pipeline_db_import_acceptance.py` | `test_pipeline_blocks_db_import_with_fail_on_warning` | `pipeline_db_import_acceptance_fake_db` | fake-db orchestration | real-db fail_on_warning | 保持必須 | warning gate契約の fake-db 早期検知 |
| `tests/test_pipeline_db_import_acceptance.py` | `test_pipeline_dry_run_does_not_change_db_state` | `pipeline_db_import_acceptance_fake_db` | fake-db orchestration | real-db dry_run | 保持必須 | dry-run レポート契約を高速担保 |
| `tests/test_pipeline_db_import_acceptance.py` | `test_pipeline_reimport_same_file_is_idempotent` | `pipeline_db_import_acceptance_fake_db` | fake-db orchestration | real-db idempotent | 保持必須 | idempotent契約の早期検知層 |
| `tests/test_option2_db_integration_postgres.py` | `test_option2_schema_columns_and_nullable_weight` | `option2_db_integration_postgres_schema_contract` | real-db option2 schema | 近似なし | 保持必須 | Option2固有DDL/制約の正本 |
| `tests/test_option2_db_integration_postgres.py` | `test_option2_g_unit_persists_amount_unit_and_weight` | `option2_db_integration_postgres_schema_contract` | real-db option2 behavior | loader g変換 / pipeline real-db import正常系（層差） | 保持必須 | Option2保存仕様の固有担保 |
| `tests/test_option2_db_integration_postgres.py` | `test_option2_ml_unit_persists_amount_and_unit_but_keeps_weight_null` | `option2_db_integration_postgres_schema_contract` | real-db option2 behavior | loader ml変換（層差） | 保持必須 | Option2 null-weight仕様の固有担保 |
| `tests/test_option2_db_integration_postgres.py` | `test_option2_validator_gate_blocks_invalid_before_db_write` | `option2_db_integration_postgres_schema_contract` | real-db gate | `test_postgres_blocks_db_import_when_validation_fails` | 今は触らない | Option2流れでも gate安全性確認が必要。削減可否は方針確定後 |
| `tests/test_option2_db_integration_postgres.py` | `test_option2_canonical_template_with_header_only_is_db_safe` | `option2_db_integration_postgres_schema_contract` | real-db option2 import edge | real-db normal import系 | 今は触らない | header-only の Option2安全性は境界ケースとして独立維持 |
| `tests/test_option2_db_integration_postgres.py` | `test_option2_migration_backfills_legacy_like_rows` | `option2_db_integration_postgres_schema_contract` | real-db migration backfill | 近似なし | 保持必須 | Option2 migration固有。代替不能 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_normal_import_only_after_validation_passes` | `pipeline_db_integration_postgres_runtime_contract` | real-db runtime | fake-db import_pass | 保持必須 | 実DB実書き込み成立の正本 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_persists_food_id_and_process_into_recipe_ingredients` | `pipeline_db_integration_postgres_runtime_contract` | real-db runtime | fake-db loader_workbook_keep_food_process | 保持必須 | 永続化結果確認は実DBで必要 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_blocks_db_import_when_validation_fails` | `pipeline_db_integration_postgres_runtime_contract` | real-db gate | fake-db validation_fail, option2 gate_fail | 保持必須 | 実DB副作用ゼロの最終担保 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_blocks_db_import_on_fail_on_warning` | `pipeline_db_integration_postgres_runtime_contract` | real-db gate | fake-db fail_on_warning | 保持必須 | 実DBでの warning gate を担保 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_dry_run_keeps_db_state_unchanged` | `pipeline_db_integration_postgres_runtime_contract` | real-db transaction | fake-db dry_run | 保持必須 | 実DBトランザクション rollback確認 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_reimport_same_file_is_idempotent` | `pipeline_db_integration_postgres_runtime_contract` | real-db runtime | fake-db idempotent | 保持必須 | 実DB状態遷移の idempotent 正本 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_parent_existing_mode_skip_keeps_existing_parent_and_children` | `pipeline_db_integration_postgres_runtime_contract` | real-db runtime contract | 近似なし | 保持必須 | skip運用契約の固有担保 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_parent_existing_mode_update_legacy_compatibility_updates_parent_but_not_children` | `pipeline_db_integration_postgres_runtime_contract` | real-db legacy compatibility | 近似なし | 今は触らない | legacy方針確定前は監査用として維持 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_db_failure_does_not_leave_partial_state` | `pipeline_db_integration_postgres_runtime_contract` | real-db atomicity | 近似なし | 保持必須 | 部分書き込み防止の核心契約 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_replace_replaces_parent_and_children_atomically` | `pipeline_db_integration_postgres_runtime_contract` | real-db replace contract | 近似なし | 保持必須 | replace完全置換の固有担保 |
| `tests/test_pipeline_db_integration_postgres.py` | `test_postgres_replace_failure_rolls_back_recipe_unit` | `pipeline_db_integration_postgres_runtime_contract` | real-db rollback | 近似なし | 保持必須 | replace失敗時原子性の固有担保 |

# 5. 保持必須ケース
- `test_pipeline_loader_canonical_v1.py` の loader変換3件。
- `test_pipeline_acceptance.py` の5件（non-db gate正本）。
- `test_pipeline_db_import_acceptance.py` の6件（fake-db orchestration契約）。
- `test_option2_db_integration_postgres.py` の Option2固有4件（schema/g/ml/backfill）。
- `test_pipeline_db_integration_postgres.py` の runtime契約10件（normal/fail_on_warning/dry_run/idempotent/skip/atomicity/replace）。

# 6. 移管候補ケース
- `test_pipeline_loader_canonical_v1.py`
  - `test_pipeline_accepts_canonical_template_as_valid_structure`
  - `test_pipeline_stops_on_invalid_sheet_name_and_keeps_first_failure`

移管先候補:
- `tests/test_pipeline_acceptance.py`（non-db gate正本）

移管方針:
- assertion 意味は維持し、受け皿側に同等ケースを先に追加してから元位置を削減候補化する。

# 7. 将来削減候補ケース
- `test_pipeline_loader_canonical_v1.py::test_pipeline_does_not_call_db_loader_when_phase1_fails`

条件:
- `test_pipeline_db_import_acceptance.py::test_pipeline_blocks_db_import_on_validation_fail` 側で同一期待（`db_import_executed=False` など）を維持できること。
- 受け皿側の入力性質（invalid sample）と期待が同等であることを確認すること。

# 8. 今は触らないケース
- `test_option2_db_integration_postgres.py::test_option2_validator_gate_blocks_invalid_before_db_write`
- `test_option2_db_integration_postgres.py::test_option2_canonical_template_with_header_only_is_db_safe`
- `test_pipeline_db_integration_postgres.py::test_postgres_parent_existing_mode_update_legacy_compatibility_updates_parent_but_not_children`

理由:
- Option2固有境界/legacy互換方針の確定が先で、先行削減は監査性を下げるため。

# 9. 削減前に必要な条件
1. 受け皿先に同等ケースが存在すること（同一層・同一入力性質・同一期待）。
2. fake-db と real-db の層差ケースを誤って統合しないこと。
3. `skip/update/replace`・rollback・atomicity・Option2 migration の固有契約は削減対象外であること。
4. collect-only で参照崩れがないこと。
5. 削減後の実行単位（always/db_required/optional）の説明を docs に反映すること。

# 10. 結論
- 現時点で安全に候補化できる中心は、`test_pipeline_loader_canonical_v1.py` 内の gate混在ケース。
- fake-db vs real-db、Option2固有、runtime atomicity は保持対象であり削減対象にしない。
- 実削減は「移管完了 → 同等担保確認 → 最小削減」の順で段階実施する。

## 実削減に向けた順序（提案）
1. 第1段階: gate混在ケースの移管（loader_mixed -> pipeline_acceptance）
2. 第2段階: 移管後に loader_mixed から重複1件を最小削減
3. 第3段階: Option2非固有候補の再判定（削減ではなく再分類）

## 実施履歴（Prompt 12）
- 実施済み1件:
  - `test_pipeline_loader_canonical_v1.py::test_pipeline_stops_on_required_invalid_samples`
    -> `test_pipeline_acceptance.py::test_pipeline_blocks_on_required_invalid_samples`
- 検証結果:
  - collect-only: 移管元 6件 / 移管先 6件
  - 実行: 対象2ファイルで `12 passed`
