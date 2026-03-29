# 最終データ契約仕様（正式）

- 文書ID: `FINAL-DATA-CONTRACT-SPEC`
- 版数: `v1.0.0`
- 作成日: `2026-03-26`
- 状態: `Approved for implementation planning`
- 参照元:
  - `docs/data_model_review_report.md`
  - `docs/data_model_review_evidence_report.md`
  - `docs/design_option_comparison_report.md`

## 1. 文書の目的
本書は、Excel取込からDB投入、栄養値参照、将来API設計までに関わるデータ契約を正式固定するための文書である。

本書は実装手順書ではなく、以下の解釈ぶれを防ぐ設計契約書である。
- 更新時に親子をどう整合させるか
- 栄養値の正本を何に置くか
- ingredients情報をどの粒度で保持するか

本書は、今後のAPI設計、pytest契約テスト、運用判断の基準として扱う。

## 2. 適用範囲
### 2.1 対象範囲
- Excel取込（canonical判定、legacy変換、validation）
- DB投入契約（親子更新契約、整合条件）
- 栄養値参照契約（検索/一覧/詳細/献立生成が参照する値）
- 将来API設計の前提制約

### 2.2 対象外
- UI仕様
- 外部AIワークフロー仕様
- 高度な献立アルゴリズム詳細
- 実装コード変更・DDL適用そのもの

## 3. 用語定義
- `canonical Excel`: `Recipes`/`Ingredients`/`Steps` を中心とした正式入力Excel形式。
- `loader互換形式`: DBローダーが受ける `Recipe_Master`/`Ingredients`/`Steps` 形式。
- `parent`: `recipes` テーブル行。
- `child`: `recipe_ingredients` と `recipe_steps` の行。
- `skip`: 既存`recipe_id`がある場合、当該レシピを更新しない投入モード。
- `replace`: 既存`recipe_id`がある場合、親子を一体で置換する投入モード。
- `source of truth (SoT)`: API・検索・献立生成で正として参照する値の公式保持先。
- `MVP`: 現行運用を壊さずに最短で提供する最小実用段階。
- `将来拡張`: MVP後に段階的に追加する監査性・再計算性・拡張検索対応。
- `監査用情報`: 入力由来・計算根拠・処理条件を追跡可能にするための補助情報。

## 4. 現行コード上の確定事実
本章は「現行挙動」の記録であり、次章以降の正式契約とは区別する。

- 事実A-1: `load_excel_to_postgres.py` の `--parent-existing-mode update` は親のみ更新し、子は `ON CONFLICT DO NOTHING` により更新しない。
- 事実A-2: `tests/test_pipeline_db_integration_postgres.py` で、`update`時に親更新・子据え置きが検証済み。
- 事実B-1: 栄養値は `recipes` の栄養列をAPI検索/返却で直接参照している。
- 事実B-2: ingredientsから親栄養を再計算する正式経路は現行投入コードに存在しない。
- 事実C-1: canonicalの `Food_ID`/`Process`/`Yield_Rate_Applied`/`Retention_Rule_Applied` はDB投入前の縮約で落ちる。
- 事実C-2: 現行DBスキーマは上記列を保持しない。

## 5. 正式仕様A: 更新契約

### 5.1 正式サポートモード
本仕様で正式サポート対象とする投入モードは以下とする。
- `skip`
- `replace`

### 5.2 `update` の扱い
- `update` は **正式契約外（廃止対象）** とする。
- 理由: 親子不整合を制度的に許容し、将来のAPI/管理画面整合を破壊するため。
- 取扱い: 実装に残存する場合でも、新規仕様・新規テスト・新規運用では依存しない。

### 5.3 `skip` の契約
- 既存判定キー: `recipe_id`。
- 既存時の振る舞い: 当該`recipe_id`の親子データは変更しない。
- 親子への影響: parent/childとも不変。
- 想定用途: 再投入時の重複回避、追加入力時の非破壊運用。

### 5.4 `replace` の契約
- 対象単位: **1レシピ（`recipe_id`）単位**。
- 定義: 既存`recipe_id`がある場合、当該レシピのparentとchildを一体で置換する。
- 親子一体要件:
  - parentのみ更新してchildが旧版のまま残る状態を禁止する。
  - `recipe_ingredients` と `recipe_steps` は、入力データに一致する集合へ更新する。
- 整合条件（処理後）:
  - 対象`recipe_id`で、parentは入力最新版と一致する。
  - 対象`recipe_id`で、childは入力集合と一致し、旧child残存がない。
  - `line_no`/`step_number` は仕様に定めた順序契約を満たす。
- 失敗時挙動:
  - 対象`recipe_id`単位で **原子的（all-or-nothing）** であること。
  - 途中失敗時は、対象レシピを置換前状態のまま保持すること。
- 想定用途: レシピ修正の正式反映、監査差し替え、マスタ再投入。

### 5.5 契約違反として扱うべき状態
以下は仕様違反（重大）とする。
- 親だけ新しく子が古い（半更新）
- replace後に古いchildが残存
- replace後に入力に存在しないchildが混在
- `steps`の順序契約違反（重複/欠番/不正順序）
- トランザクション失敗後に部分反映が残る

### 5.6 partial update の扱い
- 管理画面等での `partial update` は、**別仕様が承認されるまで禁止** とする。
- 部分更新を導入する場合は、同定キー・削除同期・競合解決を独立仕様で定義する。

## 6. 正式仕様B: 栄養値の正本

### 6.1 MVP正式仕様
- MVP段階の栄養SoTは **`recipes` の栄養列** とする。
  - `energy_kcal`
  - `protein_g`
  - `fat_g`
  - `carbohydrate_g`
  - （補助）`p_ratio`/`f_ratio`/`c_ratio`
- 以下は上記SoTを参照する。
  - 栄養検索API
  - 献立生成API
  - 一覧/詳細APIの栄養表示
- 理由:
  - 現行コードと整合し、MVP性能・運用安定性を維持できるため。

### 6.2 非正式/未採用（MVPでは保証しない）
- ingredients起点の再計算をMVP正式要件とはしない。
- ingredientsだけから親栄養の正確再構築が可能であることは保証しない。
- `Nutrition_Summary` 等を本番SoTとして扱うことはMVPでは採用しない。

### 6.3 将来拡張方針
- 将来は二層構造を検討する。
  - 層1: 計算・監査用の原本
  - 層2: API配信用の集計済み正本（またはスナップショット）
- 移行検討条件:
  - ingredients保持粒度が再計算可能レベルまで拡張済み
  - 再計算規約（計算式、丸め、バージョン管理）が固定済み
  - 監査要件（説明責任粒度）が業務合意済み

## 7. 正式仕様C: ingredients保持粒度

### 7.1 MVPで保持対象とする候補
MVPで「保持対象として先行固定」する列は以下。
- `Food_ID`
- `Process`

### 7.2 MVPでの必須/任意/未確定
- `Food_ID`: **任意（未入力許容）** を基本方針とする。
- `Process`: **任意** を基本方針とする。
- ただし、未入力許容レベル（WARN/ERROR境界）は業務判断が残るため、詳細閾値は未確定事項に記載する。

### 7.3 MVPで保持対象外とするもの
MVPでは以下を保持必須にしない。
- 重量基準詳細（例: gross/netの複数基準）
- 歩留まり関連（`Yield_Rate_Applied` 等）
- 残存率関連（`Retention_Rule_Applied` 等）
- その他監査拡張情報（原料辞書照合補助など）

### 7.4 将来拡張方針
- 方向性は以下のいずれか。
  - C-3相当: ingredientsに再計算・監査に必要な列を直接拡張
  - C-4相当: 監査/計算向けテーブルを別建てし、API配信テーブルは軽量維持
- 拡張判断基準:
  - 再計算要件の有無
  - 監査説明責任の深さ
  - API応答性能目標

### 7.5 Excel入力仕様との関係
- canonical仕様上、`Food_ID`は未入力許容（WARN）という現行運用を尊重する。
- ただし、DB保持方針は本仕様に従い「落とさない」方向で固定する。

## 8. API設計前提としての拘束条件
今後のAPI設計者は以下を破ってはならない。
- 栄養検索は `recipes` 栄養列を参照する。
- `replace` は親子整合を前提とし、半更新を許容しない。
- 現時点でingredientsからの再計算をAPI前提にしない。
- 管理画面の部分更新は別仕様なしでは認めない。
- `update` 契約を前提としたAPI仕様は採用しない。

## 9. 契約テストに落とすべき事項（提案）
- `skip` 契約テスト:
  - 既存`recipe_id`再投入時に親子が不変であること。
- `replace` 契約テスト:
  - 親子が一体置換され、旧child残存がないこと。
  - 失敗時に部分反映しないこと（原子性）。
- 栄養SoT契約テスト:
  - APIが`recipes`栄養列を参照すること。
- ingredients保持列テスト:
  - `Food_ID`/`Process` が投入後に保持されること。
- API設計前整合テスト:
  - 親子件数整合、step順序整合、検索値整合。

## 10. 未確定事項
- 本番標準投入経路（pipeline差分投入 or integrated_csv全量投入）
- `replace` 実行権限と実行プロセス
- `Food_ID` 未入力許容レベル（現状WARN維持か厳格化か）
- 栄養再計算を必須化する時期
- 管理画面での部分更新要否

## 11. 次に固定すべき実装仕様
- `replace` 実装仕様（対象単位、既存削除範囲、投入順序）
- child delete/insert順序と整合チェック仕様
- transaction方針（レシピ単位原子性/バッチ単位原子性）
- `Food_ID`/`Process`保持に向けたDDL案と移行方針
- pytest追加対象と受け入れ基準（skip/replace/SoT/整合）

## 12. Decision Summary
- 更新契約は `skip` / `replace` を正式採用し、`update` は正式契約外（廃止対象）。
- `replace` は親子一体置換を必須とし、半更新を禁止。
- MVPの栄養SoTは `recipes` 栄養列で固定。
- MVPではingredients再計算を正式要件にしない。
- MVPのingredients粒度は `Food_ID` / `Process` の最小保持を採用。
- 歩留まり・残存率・監査拡張は将来段階で拡張する。

## 13. 仕様固定チェックリスト（実装開始前）
- [ ] `update` を正式契約外として運用文書に明記した
- [ ] `skip` と `replace` の受け入れ条件が定義済み
- [ ] `replace` の原子性要件（失敗時ロールバック）が定義済み
- [ ] 栄養SoT=`recipes` をAPI仕様に反映した
- [ ] ingredients再計算をMVP非要件と明記した
- [ ] `Food_ID`/`Process` の保持方針を確定した
- [ ] 未確定事項の意思決定担当と期限を設定した
- [ ] 契約テストの追加対象を実装計画に登録した
