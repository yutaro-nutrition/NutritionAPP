# データモデル監査レポート（2026-03-26）

## 前提と監査範囲
- 監査目的: API/UI本格実装前に、現行DB構造とExcel取込パイプラインの曖昧さ・不整合・将来リスクを特定する。
- 主な確認対象:
  - `app_api/sql/create_tables.sql`
  - `scripts/import_recipe_excel_pipeline.py`
  - `load_excel_to_postgres.py`（`scripts/load_excel_to_postgres.py` はラッパー）
  - `scripts/validate_recipe_excel.py`
  - `scripts/convert_legacy_recipe_excel.py`
  - `tests/test_pipeline_acceptance.py`
  - `tests/test_pipeline_db_import_acceptance.py`
  - `tests/test_pipeline_db_integration_postgres.py`
  - `tests/conftest.py`
  - `tests/fixtures/workbook_factory.py`
  - `README.md`, `docs/*`（投入・Excel・DB仕様）

## 事実と推測の区分
- 事実: 上記コード/ドキュメント内の明示ロジック・制約・テスト結果に基づく記述。
- 推測: 現在のコードに直接書かれていないが、将来API/運用時に高確率で問題化する点。

---

## 1. 現在のデータ構造の要約

### 1-1. テーブル役割（現行実装ベース）
- `recipes`
  - 1レシピ1行の親テーブル。
  - 栄養マクロ（`energy_kcal`, `protein_g`, `fat_g`, `carbohydrate_g`）とPFC比（`p_ratio`,`f_ratio`,`c_ratio`）を保持。
  - カテゴリ列（`category_lv1`,`category_lv2`,`category_lv3`）とメタ列（`tags`,`source_*`,`qa_status`,`version`）を保持。
  - PKは `recipe_id`。
- `recipe_ingredients`
  - レシピ配下の材料明細。
  - FK `recipe_id -> recipes.recipe_id`。
  - 行順/識別は `line_no`（UNIQUE: `(recipe_id, line_no)`）。
  - 実質保持は「表示名＋重量g＋notes」で、`ingredient_alias` はあるが投入時は `None` 固定。
- `recipe_steps`
  - レシピ配下の手順明細。
  - FK `recipe_id -> recipes.recipe_id`。
  - 手順順は `step_number`（UNIQUE: `(recipe_id, step_number)`）。

### 1-2. 主なリレーション
- 親子は `recipes` を中心とする1対多。
- 子テーブルは `ON DELETE CASCADE`。
- orphanはFK上は原則発生不可（ただしローダーは別途orphanチェックも実施）。

### 1-3. Excel → DB の実フロー
1. `import_recipe_excel_pipeline.py` が入力Excelを `canonical/legacy/canonical_like/legacy_like` に判定。
2. legacy系は `convert_legacy_recipe_excel.py` でCanonical化。
3. `validate_recipe_excel.py` でCanonical検証。
4. DB投入時はCanonicalを「ローダー互換Excel」に再変換（`Recipes/Ingredients/Steps` -> `Recipe_Master/Ingredients/Steps`）。
5. `load_excel_to_postgres.py` が `recipes -> recipe_ingredients -> recipe_steps` 順で投入。

---

## 2. 危険箇所・曖昧箇所

### 2-1. 仕様書と実装の衝突（運用ルールが一本化されていない）
- 事実:
  - `docs/recipe_excel_db_mapping.md` は子テーブルUPSERTを `DO UPDATE` と記載。
  - 実装 `load_excel_to_postgres.py` は子テーブルを `ON CONFLICT ... DO NOTHING`（insert-only）。
  - `docs/postgres_load_spec.md` は「Phase3既定: truncate + reload」を記載。
  - 現行パイプラインは「差分再投入（skip/update）」前提。
- リスク:
  - 「同一Recipe再投入時に子が更新される」と誤認して運用すると、実DBは子が古いまま残る。
  - API詳細取得で親情報だけ新しく、ingredients/stepsが旧版の混在状態を返す。

### 2-2. `--parent-existing-mode update` の業務意味が危険（親のみ更新、子は据え置き）
- 事実:
  - テスト `tests/test_pipeline_db_integration_postgres.py` で、`update` 時に `recipe_name` は更新されるが、`ingredient_name_line1` は初回値のままを明示確認。
- リスク:
  - レシピ修正運用で「更新成功」に見えても、材料/手順が更新されない。
  - 管理画面編集や将来の差分更新APIで、期待とDB実態が乖離する。

### 2-3. Ingredient順序キーの再採番で意味順が崩れる
- 事実:
  - `prepare_ingredients()` は `Ingredient_No` を使わず、行順から `line_no = cumcount()+1` を再生成。
  - 不正行（欠損/重量<=0）はdrop後に再採番。
- リスク:
  - 元Excelの材料番号とDB行番号が一致しない。
  - 既存レシピ更新時、同じ材料でも `line_no` がずれると別行扱いされ、更新不能（insert-onlyと組み合わさる）。

### 2-4. Stepsは連番制約がDBで保証されない
- 事実:
  - DB制約は `step_number >=1` と `(recipe_id, step_number)` unique のみ。
  - `prepare_steps()` も連番ギャップ（1,3,5等）を補正しない。
- リスク:
  - API詳細で手順欠番がそのまま露出。
  - 将来の編集UIで順序再構築ロジックが複雑化。

### 2-5. 栄養値の正本が不明確（確定値保存 vs 材料由来再計算）
- 事実:
  - `recipes` にマクロ+PFC比を保存。
  - パイプラインのローダー互換変換で `p_ratio/f_ratio/c_ratio` は再計算して上書き生成。
  - `recipe_ingredients` に Food_IDや微量栄養素計算に必要な列は保存されない。
- リスク:
  - どの時点の栄養値をAPI検索の正とするかが未定義。
  - 将来「材料変更後の再計算」要件に対応できない（再計算根拠列がDBにない）。

### 2-6. Canonical仕様で許可した情報がDBで落ちる
- 事実:
  - Canonicalは `Food_ID`, `Preparation_State`, `Process`, `Yield_Rate_Applied` 等を許容。
  - `build_loader_workbook_from_canonical()` で DB投入時に `Ingredient_Name`, `Weight(g)`, `Notes` へ縮約。
  - `load_excel_to_postgres.py` の必須列は Ingredientsで `recipe_id, ingredient_name, weight_g` のみ。
- リスク:
  - 将来の検索（調理状態別・歩留まり別）や監査トレースに必要な情報が消失。
  - 取り込み成功でも意味的にはデータ欠損が発生。

### 2-7. カテゴリ/qa/versionのデフォルト固定が強い
- 事実:
  - `prepare_recipes()` で `category_lv1/category_lv2 = "unknown"`, `qa_status = "passed"`, `version = "v1"` を補完。
- リスク:
  - Excel側の真値とDB値が一致しない可能性。
  - `qa_status` を品質ゲート指標として使う設計と整合しない。

### 2-8. alias吸収方針が文書間で矛盾
- 事実:
  - Canonical仕様は「エイリアス吸収原則禁止」。
  - 一方で `load_excel_to_postgres.py` は `SHEET_COLUMN_ALIASES` で広範な別名受理。
- リスク:
  - 「どこまでを不正入力とみなすか」が層ごとに異なり、障害再現が難化。

### 2-9. `tags` の検索精度が低い（部分一致TEXT）
- 事実:
  - APIリポジトリは `Recipe.tags.ilike('%...%')` でタグ検索。
  - tagsはCSV文字列。
- リスク:
  - 誤マッチ（例: `low_fat` と類似部分文字列）や表記揺れの吸収不良。
  - 条件検索APIの再現性が不安定。

### 2-10. テストは「投入可否」に強く、「意味整合」に薄い
- 事実:
  - 現行テストは gate/件数/idempotency/update-vs-skip の確認が中心。
  - 栄養値妥当性、カテゴリ妥当性、Food_ID保持、step欠番、line_no再採番影響は未検証。
- リスク:
  - 取込成功なのに業務要件に耐えないデータが蓄積する。

---

## 3. API設計前に確定すべき項目（優先度付き）

### High
1. 親子更新契約を確定（`skip/update` 時に子をどう扱うか）
- 決めないと: レシピ修正時に親子不整合が常態化し、詳細APIの信頼性が崩れる。

2. 栄養値の正本定義（recipes固定値か、ingredients由来再計算か）
- 決めないと: 栄養検索APIと将来献立生成で、同一recipeの評価が揺れる。

3. Ingredients粒度（Food_ID/Process/歩留まり/調理状態）をDBに残すか
- 決めないと: 検索・再計算・監査トレース要件に後追いで対応不能。

### Medium
4. `line_no`/`step_number` の採番責務（Excel値尊重 or 再採番）
- 決めないと: 編集・差分反映・UI並び順が不安定。

5. `tags` をTEXT継続か正規化テーブル化か
- 決めないと: 検索精度とインデックス戦略が定まらない。

6. `qa_status/version/source_*` の真値ソース定義
- 決めないと: 品質指標・監査ログとして使えない。

### Low
7. `category_lv3` の運用（NULL許容のままか、辞書化するか）
- 決めないと: 当面は影響小だが、分類UI導入時に揺れが顕在化。

8. `updated_at` の更新ルール（親のみ更新で良いか）
- 決めないと: 差分監視や更新履歴判定が曖昧。

---

## 4. 推奨する次の検証タスク

### 4-1. SQLレベル検証（提案）
```sql
-- 1) 親子件数の最低成立（親に対して子が0件のレシピ）
SELECT r.recipe_id,
       COUNT(DISTINCT i.id) AS ingredient_count,
       COUNT(DISTINCT s.id) AS step_count
FROM recipes r
LEFT JOIN recipe_ingredients i ON i.recipe_id = r.recipe_id
LEFT JOIN recipe_steps s ON s.recipe_id = r.recipe_id
GROUP BY r.recipe_id
HAVING COUNT(DISTINCT i.id) = 0 OR COUNT(DISTINCT s.id) = 0;

-- 2) step番号の欠番検知
WITH seq AS (
  SELECT recipe_id,
         step_number,
         ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY step_number) AS rn
  FROM recipe_steps
)
SELECT recipe_id, step_number, rn
FROM seq
WHERE step_number <> rn;

-- 3) ingredient番号の欠番検知
WITH seq AS (
  SELECT recipe_id,
         line_no,
         ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY line_no) AS rn
  FROM recipe_ingredients
)
SELECT recipe_id, line_no, rn
FROM seq
WHERE line_no <> rn;

-- 4) 親栄養値が0埋めになっているレシピ
SELECT recipe_id, recipe_name, energy_kcal, protein_g, fat_g, carbohydrate_g
FROM recipes
WHERE energy_kcal = 0
   OR (protein_g = 0 AND fat_g = 0 AND carbohydrate_g = 0);

-- 5) タグ検索の曖昧ヒット候補（部分一致依存確認）
SELECT recipe_id, tags
FROM recipes
WHERE tags ILIKE '%protein%';

-- 6) source/version固定値偏り（運用上の意味検証）
SELECT source_batch, qa_status, version, COUNT(*)
FROM recipes
GROUP BY source_batch, qa_status, version
ORDER BY COUNT(*) DESC;
```

### 4-2. 追加pytest案（提案）
- `test_parent_update_replaces_children_when_policy_is_replace`（将来ポリシー確定後）
  - 目的: 親更新時に子の整合が壊れないことを契約化。
- `test_ingredient_line_no_respects_ingredient_no_or_explicit_policy`
  - 目的: 再採番による意図しない差分を防ぐ。
- `test_step_sequence_gap_rejected_or_normalized`
  - 目的: 欠番stepを受理するか補正するかを明文化。
- `test_nutrition_source_of_truth_consistency`
  - 目的: 栄養検索APIで使う値が常に一意であることを保証。
- `test_food_id_and_process_columns_persistence_policy`
  - 目的: DBに保持しない仕様なら「捨てる」ことを明示、保持する仕様なら保存保証。

### 4-3. サンプルデータ目視確認（提案）
- 同一 `Recipe_ID` を2回投入（材料のみ変更）し、`skip/update` で親子差分がどう残るか比較。
- `Food_ID` あり/なし、`Process` あり/なしのCanonicalを投入し、DB消失列を確認。
- `Step_No` 欠番データを投入し、API詳細の表示順と欠番露出を確認。

---

## 5. 改修提案（必要最小限、未実装）

### 今すぐ直すべき（優先: 高）
1. 仕様書の一本化（`skip/update/children policy`, `truncate+reload`, `DO NOTHING/DO UPDATE`）
- 理由: 実装より前に契約が二重化していると、API設計が破綻する。

2. 親子更新ポリシーの明文化とテスト契約化
- 理由: 現在の最大リスクは「親更新・子据え置き」による意味不整合。

3. 栄養値正本の定義
- 理由: 栄養検索API/献立生成APIの基盤契約になるため。

### 後でよい（優先: 中〜低）
4. tags正規化（`recipe_tags`）検討
- 理由: 現段階はTEXTでも動くが、検索品質を上げる段階で必要。

5. ingredients拡張列（Food_ID/Process等）の永続化
- 理由: 検索・再計算要件が固まってからでもよいが、要件確定前に消失設計は避ける。

---

## 断定できなかった点（要追加確認）
- どの投入経路を「正式運用」とするか（`import_recipe_excel_pipeline.py` 系か、`app_api/scripts/import_integrated_csv.py` 系か）。
- 栄養値の計算責務を将来どこに置くか（Excel生成時・投入時・DB内・API内）。
- `qa_status` を実運用で品質判定に使うか、単なるメタ情報か。
- `recipe_tags` / `recipe_nutrition` を導入する確定時期。

## 監査まとめ
- 現行は「投入成功」を高い精度で担保している。
- 一方で「更新意味の一貫性」「栄養値の正本」「材料粒度の保持」が未確定で、API設計直前の主要リスクになっている。
- API設計に進む前に、最低限 `親子更新契約 / 栄養正本 / ingredients粒度` の3点を仕様として固定することを推奨する。
