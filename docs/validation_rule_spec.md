# レシピDB 検証ルール仕様

## 1. 必須シート名
検証対象 `.xlsx` には次のシートがこの順序で存在すること。

1. `Ingredients`
2. `Steps`
3. `Recipe_Master`

## 2. 必須列順
### Ingredients
1. `Recipe_ID`
2. `Ingredient_Name`
3. `Weight(g)`
4. `Notes`

### Steps
1. `Recipe_ID`
2. `Step_Number`
3. `Instruction`

### Recipe_Master
1. `Recipe_ID`
2. `Recipe_Name`
3. `Energy(kcal)`
4. `Protein(g)`
5. `Fat(g)`
6. `Carbohydrate(g)`
7. `P_ratio`
8. `F_ratio`
9. `C_ratio`
10. `Tag`
11. `Cooking_Method`
12. `Notes`

## 3. 欠損禁止ルール
- 主要列（`Recipe_ID`, `Recipe_Name`, `Ingredient_Name`, `Weight(g)`, `Step_Number`, `Instruction`, 栄養列, `Tag`, `Cooking_Method`）は欠損不可。
- `Notes` 列は欠損可。
- 空文字、空白のみ、`NaN` は欠損として扱う。

## 4. 数値列ルール
- `Weight(g)` は数値かつ `> 0`。
- `Step_Number` は整数。
- `Energy(kcal)`, `Protein(g)`, `Fat(g)`, `Carbohydrate(g)` は数値かつ `>= 0`。
- `P_ratio`, `F_ratio`, `C_ratio` は数値かつ `0-100` を原則とする。

## 5. Recipe_ID 重複禁止
- `Recipe_Master.Recipe_ID` は一意であること。

## 6. Recipe_Name 重複禁止
- `Recipe_Master.Recipe_Name` は一意であること（前後空白は正規化して比較）。

## 7. Ingredients / Steps / Recipe_Master の整合ルール
- `Ingredients.Recipe_ID` と `Steps.Recipe_ID` は `Recipe_Master.Recipe_ID` の部分集合であること。
- `Recipe_Master` の各 `Recipe_ID` には、最低1件の Ingredients 行と最低1件の Steps 行が存在すること。

## 8. Step_Number はレシピごとに1からの連番
- 各 `Recipe_ID` で `Step_Number` は `1,2,3...` の連番であること。
- 重複、欠番、0開始、負数、小数は不正。

## 9. PFC整合チェックルール
基本式:
- Protein kcal = `Protein(g) * 4`
- Fat kcal = `Fat(g) * 9`
- Carbohydrate kcal = `Carbohydrate(g) * 4`

判定:
- `Energy(kcal)` と `PFC由来エネルギー合計` の乖離が許容範囲内であること。
- 許容範囲は `max(30kcal, Energyの20%)` を基準とする。
- `P_ratio/F_ratio/C_ratio` は再計算値と概ね一致し、合計は概ね100（許容 ±3）であること。

## 10. Tag整合チェックルール
タグは `Recipe_Master.Tag` を区切り文字（`,` `、` `;` `|`）で分解して判定する。  
再計算した栄養条件と整合しない宣言タグはエラー、推奨タグ不足は警告とする。

最低限のタグ条件:
- `高たんぱく`: `Protein(g) >= 20`
- `低脂質`: `Fat(g) < 10`
- `高炭水化物`: `Carbohydrate(g) >= 70`
- `試合後`: `高たんぱく` かつ `高炭水化物`
- `増量期`: `Energy(kcal) >= 650` または `Fat(g) >= 20`
- `減量期`: `高たんぱく` かつ `低脂質`
- `試合前`: `低脂質` かつ 消化が良い（簡易判定: 揚げ物・激辛・にんにく過多を含まない）

## 11. カテゴリ別成立条件
- `udon`: うどん食材（例: `うどん`）を含む。
- `soba`: そば食材（例: `そば`, `蕎麦`）を含む。
- `ramen`: 麺食材（例: `ラーメン`, `中華麺`, `麺`）を含む。
- `bread`: パン食材（例: `パン`, `食パン`, `バゲット`）を含む。
- `donburi`: ごはん系食材を含み、かつ主菜成立（例: 肉/魚/卵/大豆主菜、または十分なたんぱく質）。
- `side_lowprotein`: `Protein(g) < 5.0`。
- `side_protein5`: `4.0 <= Protein(g) <= 6.5`。
- `soup`: 汁物成立（名称・工程・食材が汁物系）かつエネルギー過剰を防ぐ（目安 `Energy <= 350`）。
- `dessert`: デザート成立（甘味系）かつ主菜化しない（主食/主菜要素過多を含まない）。

## 12. 判定区分
- `passed`: エラー0、警告0。
- `manual_review`: エラー0、警告1件以上。
- `failed`: 重大エラー1件以上。

重大エラー例:
- 必須シート欠落
- 列順不一致
- 欠損値あり
- `Recipe_ID` 重複
- `Recipe_Name` 重複
- PFC大崩れ
- カテゴリ不成立
- 件数不足

## 追加ルール: 抽象表現禁止
Ingredients の `Ingredient_Name`/`Notes`、Steps の `Instruction` に以下の抽象表現を含まないこと。

- `適量`
- `少々`
- `お好み`
- `ひとつまみ`
- `適宜`

## 運用メモ
- 検証スクリプトは不足ファイルでも安全に継続し、結果をJSONで保存する。
- 今後カテゴリが増えた場合は、カテゴリ定義辞書を追加して再利用する。

---

## 簡易使用方法（README相当）
### 実行コマンド
```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_validation.ps1
```

または直接:
```powershell
python scripts/validation/run_all_validations.py
```

### 出力先
- 個別レポート: `reports/validation/*_validation.json`
- サマリー: `reports/validation/summary_validation_report.json`

### 判定区分の意味
- `passed`: 自動検証で問題なし
- `manual_review`: 致命的ではないが人手確認推奨
- `failed`: 統合前に修正が必要

### 失敗時に次に見るべきファイル
1. `reports/validation/summary_validation_report.json`
2. 失敗対象の `reports/validation/<対象名>_validation.json`
3. 元データ `data/generated/<対象xlsx>`（必要に応じてプロジェクト直下同名ファイルも確認）
