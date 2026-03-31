# 1. 目的
`tests/test_pipeline_loader_canonical_v1.py` に残っているテスト群を関数単位で再判定し、loader 固有として保持すべきか、将来再検討すべきかを固定する。

# 2. 判定前提
- 責務境界の正本: `docs/pipeline_test_responsibility_map.md`
- 削減候補判定の正本: `docs/pipeline_test_reduction_candidates.md`
- 実行分類の前提: `docs/test_execution_matrix.md`
- gate混在3件はすでに acceptance 側へ移管済み（Prompt 12-14）。
- 今回は assertion の意味を変更しない。
- 今回は削除/移管を実施しない（判定固定のみ）。

# 3. 現在残っているテスト一覧
- `test_pipeline_does_not_call_db_loader_when_phase1_fails`
- `test_loader_reads_canonical_sheets_and_maps_amount_value_unit`
- `test_loader_sets_weight_g_only_for_unit_g`
- `test_loader_does_not_do_1to1_ml_to_g_for_shoyu`

# 4. 関数単位の再判定表
| test function | current label | layer | decision | reason | next action |
|---|---|---|---|---|---|
| `test_pipeline_does_not_call_db_loader_when_phase1_fails` | `pipeline_loader_mixed_gate` | pipeline orchestration (non-db) | C. 次段で移管検討可能 | loader変換ではなく import-gate 側の契約（`db_import_executed=False`）を見ているため、責務純度の観点では acceptance/fake-db 側に寄せる余地がある。 | 次段で `test_pipeline_db_import_acceptance.py` との同一期待比較を行い、移管可否を決める。 |
| `test_loader_reads_canonical_sheets_and_maps_amount_value_unit` | `pipeline_loader_mixed_gate` | loader transform | A. loader 固有として保持必須 | `prepare_ingredients` / `prepare_steps` の変換結果（amount/unit/weight）を直接検証しており、gate層では代替不可。 | 維持。必要なら将来 `pipeline_loader_*` への命名整理のみ。 |
| `test_loader_sets_weight_g_only_for_unit_g` | `pipeline_loader_mixed_gate` | loader transform | A. loader 固有として保持必須 | unit=`g` の `weight_g` 導出を直接担保。Option2実DB系は層差があるため代替不可。 | 維持。 |
| `test_loader_does_not_do_1to1_ml_to_g_for_shoyu` | `pipeline_loader_mixed_gate` | loader transform | A. loader 固有として保持必須 | unit=`ml` で重量を推定しない規則を直接担保。実DB保存テストとは責務が異なる。 | 維持。 |

# 5. 保持必須ケース
- `test_loader_reads_canonical_sheets_and_maps_amount_value_unit`
- `test_loader_sets_weight_g_only_for_unit_g`
- `test_loader_does_not_do_1to1_ml_to_g_for_shoyu`

判断理由:
- いずれも canonical loader 変換ロジックの直接検証で、gate層や実DB層への移管では検証層が崩れるため。

# 6. 将来再検討候補
- `test_pipeline_does_not_call_db_loader_when_phase1_fails`

再検討理由:
- loader固有ではなく、import経路の実行抑止契約（orchestration）であるため。
- 既存 `test_pipeline_db_import_acceptance.py` との重なりを次段で比較する価値があるため。

# 7. 今回は触らない理由
- gate混在系列の移管3件を終えた直後であり、ここで追加移管すると「最小実証」の境界を超えるため。
- `test_pipeline_does_not_call_db_loader_when_phase1_fails` は将来候補だが、同一期待の受け皿整理なしに削ると検知穴が生まれるため。
- loader固有3件は現時点で責務純度が高く、優先的に触る理由が薄いため。

# 8. 次段で触るならどれか
1. `test_pipeline_does_not_call_db_loader_when_phase1_fails` を最優先で再検討する。
2. ただし「移管先で同一期待を担保できること」を先に確認し、実削減は1件単位で行う。
3. loader固有3件は当面維持し、命名/ラベルの微調整のみを検討する。

# 9. 結論
- `test_pipeline_loader_canonical_v1.py` の残件は、4件中3件が loader固有で保持必須。
- 残る1件（`test_pipeline_does_not_call_db_loader_when_phase1_fails`）のみが将来再検討対象。
- 現段階では「ここで止める」が妥当で、次段はこの1件の扱いに限定して進めるのが安全。
