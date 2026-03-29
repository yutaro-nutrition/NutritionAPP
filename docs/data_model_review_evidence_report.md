# データモデル監査 証拠補強レポート（2026-03-26）

## 1. 目的と前回レポートとの差分
- 前回 `docs/data_model_review_report.md` は、設計上の論点整理が主目的だった。
- 本レポートは、同論点を **コード/SQL/pytest/投入経路** の明示的証拠で補強し、判定を `Confirmed / Uncertain / Refuted` で固定する。
- 今回の対象3テーマ:
  1. `--parent-existing-mode update` の実挙動
  2. 栄養値の正本（source of truth）
  3. Canonical列（`Food_ID` / `Process` / 歩留まり / 残存率等）のDB落失

---

## 2. 証拠サマリー

| テーマ | 判定 | 結論の要約 | 根拠ファイル | 根拠箇所 | 影響範囲 |
|---|---|---|---|---|---|
| A. `update`時の親子挙動 | **Confirmed** | `recipe_id` 競合時、親は更新されるが子は `DO NOTHING` で更新されない | `load_excel_to_postgres.py`, `tests/test_pipeline_db_integration_postgres.py` | `insert_parents()` update分岐、`insert_ingredients()/insert_steps()` conflict分岐、`test_postgres_parent_existing_mode_update_updates_parent_but_not_insert_only_children` | レシピ修正時の親子不整合、詳細APIの整合性 |
| B. 栄養値の正本 | **Confirmed**（実装上） | 実行時に参照される栄養値は `recipes` のマクロ列。ingredients由来の再計算経路は現行投入には存在しない | `app_api/sql/create_tables.sql`, `scripts/import_recipe_excel_pipeline.py`, `load_excel_to_postgres.py`, `app_api/app/repositories/recipe_repository.py` | `recipes`栄養列定義、Canonical→loader変換時のPFC比再計算、`prepare_recipes()` の数値投入、API検索フィルタが `Recipe.*` 参照 | 栄養条件検索、献立生成、監査時の値整合 |
| C. Canonical情報のDB落失 | **Confirmed** | Canonicalで検証対象の `Food_ID/Process/Yield_Rate_Applied/Retention_Rule_Applied` 等は投入時に縮約され、DB永続化されない | `scripts/validate_recipe_excel.py`, `scripts/import_recipe_excel_pipeline.py`, `load_excel_to_postgres.py`, `app_api/sql/create_tables.sql` | validationのOptional列定義、`build_loader_workbook_from_canonical()` の出力列、loader必須列とINSERT列、DBスキーマ列定義 | 将来の再計算・詳細検索・監査追跡・編集機能 |

---

## 3. テーマA詳細: `--parent-existing-mode update` の実挙動

### 3-1. 既存判定キー
- `recipes` の既存判定は `ON CONFLICT (recipe_id)`。
  - 根拠: `load_excel_to_postgres.py:423`, `load_excel_to_postgres.py:436`

### 3-2. 親更新処理
- `insert_parents()` は `mode == "skip"` なら `DO NOTHING`、それ以外（`update`）は `DO UPDATE SET ... updated_at = NOW()`。
  - 根拠: `load_excel_to_postgres.py:402-454`

### 3-3. 子テーブル処理
- `recipe_ingredients` は `ON CONFLICT (recipe_id, line_no) DO NOTHING`。
  - 根拠: `load_excel_to_postgres.py:466-476`
- `recipe_steps` は `ON CONFLICT (recipe_id, step_number) DO NOTHING`。
  - 根拠: `load_excel_to_postgres.py:487-497`
- 実行順は親挿入/更新後に子insert。
  - 根拠: `load_excel_to_postgres.py:658-670`

### 3-4. テスト担保範囲
- `update` ケースで「親名は更新、子は初回値維持」を明示検証。
  - 根拠テスト: `test_postgres_parent_existing_mode_update_updates_parent_but_not_insert_only_children` (`tests/test_pipeline_db_integration_postgres.py:210-243`)
  - 主要assert: `recipe_name == 更新版` (`:241`) と `ingredient_name_line1 == 最初の食材` (`:242`)、`step_instruction_1 == 最初の手順` (`:243`)
- `skip` ケースも同様に親子据え置きを検証。
  - 根拠テスト: `tests/test_pipeline_db_integration_postgres.py:174-207`

### 3-5. テスト未担保範囲
- 複数行ingredients/stepsでの部分更新（行追加/削除/順序変更）の業務期待は未契約。
- 子を明示削除・置換する仕様（replaceモード）は実装・テストとも未存在。

### 3-6. 業務上の意味
- レシピ修正を `update` で再投入しても、親だけ新しく子が旧版のまま残る。
- 「更新済み」に見えるが詳細内容が古い、という不整合が発生し得る。

### 3-7. 結論
- **Confirmed**: 「親更新はされるが子更新はされない」は、実装と統合テストで一致して確認可能。

---

## 4. テーマB詳細: 栄養値の正本

### 4-1. 現行実装で栄養値を持つ場所
- `recipes` に `energy_kcal/protein_g/fat_g/carbohydrate_g/p_ratio/f_ratio/c_ratio` が NOT NULL で定義。
  - 根拠: `app_api/sql/create_tables.sql:9-15`
- `recipe_ingredients` / `recipe_steps` 側には栄養列なし。
  - 根拠: `app_api/sql/create_tables.sql:43-77`

### 4-2. import時の扱い
- Canonical→loader変換で、`Recipes` のマクロ値を `Recipe_Master` へ転記し、`P_ratio/F_ratio/C_ratio` は計算式で再計算して出力。
  - 根拠: `scripts/import_recipe_excel_pipeline.py:337-373`
- loader側 `prepare_recipes()` は `Recipe_Master` の栄養列を数値化し、欠損は `0.0` で補完。
  - 根拠: `load_excel_to_postgres.py:242-256`
- `update` 時は親の栄養列も `EXCLUDED` で更新対象。
  - 根拠: `load_excel_to_postgres.py:441-445`

### 4-3. ingredientsからの再計算有無
- `load_excel_to_postgres.py` に ingredients由来で親栄養を再計算する処理は存在しない。
- `prepare_ingredients()` は `ingredient_name/weight_g/notes` 系のみを準備。
  - 根拠: `load_excel_to_postgres.py:306-333`

### 4-4. API参照の実態
- 検索条件は `Recipe.energy_kcal/protein_g/fat_g/carbohydrate_g` を直接フィルタ。
  - 根拠: `app_api/app/repositories/recipe_repository.py:73-88`
- APIレスポンスも `Recipe` の同栄養列を返却。
  - 根拠: `app_api/app/api/mappers.py:14-17`

### 4-5. 事実と未決定事項
- 事実:
  - 現行実行系での実質SoTは `recipes` の栄養列。
  - 再計算ロジックは pipeline変換内でPFC比計算のみ（ingredients積み上げではない）。
- 未決定:
  - これを「正式な仕様SoT」として固定するか、将来 `Nutrition_Summary` やingredients再計算へ移行するかは未固定。
  - 補助証拠: `docs/recipe_excel_canonical_format_spec.md:179-181`（微量栄養素は任意シート管理）

### 4-6. 将来API観点での論点
- 栄養条件検索: 現状は親列参照で一貫だが、再計算要件が出ると整合契約が必要。
- 献立生成: 現状は親列頼み。更新時に親と子が乖離すると説明責任が難しい。
- 管理画面監査: 「この栄養値がどう算出されたか」の追跡は現行DBだけでは限定的。

### 4-7. 結論
- **Confirmed**（現行実装）: 実行時の栄養SoTは `recipes`。
- ただし「将来仕様として固定済みか」は **Uncertain**（コード外の意思決定待ち）。

---

## 5. テーマC詳細: Canonical情報のDB落失

### 5-1. Canonicalで存在する列
- Ingredients任意列に `Food_ID`, `Preparation_State`, `Process`, `Yield_Rate_Applied`, `Retention_Rule_Applied` が定義。
  - 根拠: `scripts/validate_recipe_excel.py:39-40`
  - 仕様書根拠: `docs/recipe_excel_canonical_format_spec.md:115-122`
- `Food_ID` はWARN運用を含め検証対象。
  - 根拠: `scripts/validate_recipe_excel.py:328-334`

### 5-2. DB投入段階で残る列
- Canonical→loader互換変換のIngredients出力は `Recipe_ID`, `Ingredient_Name`, `Weight(g)`, `Notes` のみ。
  - 根拠: `scripts/import_recipe_excel_pipeline.py:388-397`
- loader必須列も `recipe_id, ingredient_name, weight_g`。
  - 根拠: `load_excel_to_postgres.py:85-87`
- 子INSERT列は `recipe_id,line_no,ingredient_name,ingredient_alias,weight_g,notes,...`。
  - 根拠: `load_excel_to_postgres.py:473-476`
- DB定義も `Food_ID/Process/Yield_Rate_Applied/Retention_Rule_Applied` を保持しない。
  - 根拠: `app_api/sql/create_tables.sql:43-61`

### 5-3. どの段階で落ちるか（パイプライン）
1. Canonical validation: 列は受理・検証される。
2. `build_loader_workbook_from_canonical()`: Ingredients列を4列へ縮約（ここで主要列落失）。
3. `load_excel_to_postgres.py`: 受け取った縮約列のみ投入。

### 5-4. DBに残る列 / 落ちる列（比較）

| Canonical列（Ingredients） | DB到達 | 備考 |
|---|---|---|
| `Ingredient_Name` | 残る | `ingredient_name` |
| `Net_Weight_g` | 変換して残る | `weight_g` に正規化 |
| `Amount`, `Unit` | 落ちる（直接保持なし） | `normalize_weight_to_g()` で重量計算に利用のみ |
| `Food_ID` | 落ちる | validation対象だがDB列なし |
| `Preparation_State` | 落ちる | DB列なし |
| `Process` | 落ちる | DB列なし |
| `Yield_Rate_Applied` | 落ちる | DB列なし |
| `Retention_Rule_Applied` | 落ちる | DB列なし |

### 5-5. APIユースケース影響
- 栄養再計算API: ingredientsの元情報不足で再計算根拠が不足。
- 詳細検索API: 調理状態/プロセス/歩留まり条件検索が困難。
- 管理画面監査: Food_IDや処理条件の追跡不可。

### 5-6. 結論
- **Confirmed**: Canonicalで扱う複数列はDB投入経路で意図的に縮約され、永続化されない。

---

## 6. API設計前に必ず固定すべき仕様

### High
1. 親子更新契約（update時の子の扱い: keep / replace / upsert）
- 決めないと: 親子不整合が常態化し、詳細APIの信頼性が崩れる。
- 問題化: レシピ詳細取得、管理画面修正。

2. 栄養値の正本契約（`recipes`確定値か、再計算か）
- 決めないと: 栄養検索と献立生成で値の解釈が揺れる。
- 問題化: 栄養条件検索、献立生成、監査説明。

3. ingredients保持粒度（Food_ID/Process/歩留まり/残存率を保持するか）
- 決めないと: 将来要件で必要な列が存在せず、追加コストが高騰する。
- 問題化: 詳細検索、再計算、監査追跡。

### Medium
4. 複数投入経路の正式化（pipelineローダー vs integrated_csvローダー）
- 決めないと: 環境ごとにデータ契約が揺れる。
- 問題化: 運用手順、品質保証テスト。

5. `line_no/step_number` の採番責務
- 決めないと: 差分更新時の同一行同定が不安定。
- 問題化: 編集機能、差分監査。

### Low
6. タグ正規化（TEXT継続か `recipe_tags` へ）
- 決めないと: 検索精度改善が後手になる。
- 問題化: タグ検索APIの精度・拡張性。

---

## 7. 追加で実行すべき検証

### 7-1. SQLで確認すべきこと
- 追加ファイル: `docs/sql/data_model_audit_queries.sql`
- 内容:
  - 親子成立件数
  - child key重複
  - step/ingredient欠番
  - 栄養ゼロ偏在
  - 更新痕跡（`updated_at > created_at`）
  - メタ分布確認

### 7-2. pytestで追加すべきこと（提案）
- 親update時に子をどう扱うべきかを明示する契約テスト（replace/upsert/keepのいずれかを固定）。
- 栄養検索API前提の列充足テスト（`recipes` の栄養列が常に非NULL・非異常値）。
- 管理画面詳細表示の最小情報テスト（ingredients/stepsの欠落・欠番検知）。
- Canonical重要列落失検知テスト（`Food_ID/Process` 等を入力してもDBに残らない事実を仕様化、または保持仕様へ変更時の回帰防止）。

### 7-3. サンプルデータで目視すべきこと
- 同一 `Recipe_ID` で親・子を変えた再投入（skip/update）を比較し、業務期待と一致するか確認。
- `Food_ID/Process/Yield_Rate_Applied` 入りCanonical投入後、DB実体で列消失を確認。
- 栄養値変更のみ再投入して、検索結果が親列更新に追随するか確認。

---

## 8. まだ断定できないこと
- どの投入経路を「本番標準」とするか（pipeline差分投入と integrated_csv truncate投入の優先順位）。
  - 理由: 両経路が同居し、ドキュメントも両方を記載。
  - 断定に必要: 運用設計書またはCIでの正式ジョブ定義。
- 栄養値を将来どこで算出・監査するか（現状挙動は確認済みだが、長期仕様は未固定）。
  - 断定に必要: API仕様書でのsource-of-truth明文化。
- Canonical列落失が「最終仕様」か「過渡仕様」か。
  - 断定に必要: DB拡張ロードマップ、または保持不要の明文化。
