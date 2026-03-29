# Recipe Excel Canonical Spec v1.0

## 1. 目的
本仕様は、レシピExcelの正式仕様（canonical spec）を固定し、レシピ追加時の入力形式と検証基準を統一することを目的とする。  
本仕様の対象は「ワークブック構成」「シート定義」「列定義」「許可値」「バリデーションルール」である。

## 2. 適用範囲
本仕様は、レシピデータをExcelで作成・提出・検証する全工程に適用する。  
本仕様 v1.0 は canonical workbook の正規定義であり、仕様外の列・値・シートは受け入れない。

## 3. Canonical Workbook 構成
canonical workbook は以下の3シート固定とする。補助シートは認めない。

1. `Recipes`
2. `Ingredients`
3. `Steps`

シート名は大文字小文字を含めて完全一致とする。  
canonical template は必須列のみで構成する。任意列、補助列、説明列、日本語列名は追加しない。

## 4. シート別正式仕様
### 4.1 `Recipes`
必須列（列順固定）:

1. `Recipe_ID`
2. `Recipe_Name`
3. `Category_Code`
4. `Servings`
5. `Tags`

制約:

1. `Recipe_ID`: 空欄禁止、一意
2. `Recipe_Name`: 空欄禁止
3. `Category_Code`: 定義済み8分類のいずれか1つ
4. `Servings`: 正の整数のみ
5. `Tags`: 空欄禁止、`|` 区切り、1〜5個、定義済みタグのみ

### 4.2 `Ingredients`
必須列（列順固定）:

1. `Recipe_ID`
2. `Ingredient_No`
3. `Food_ID`
4. `Ingredient_Name`
5. `Amount_Value`
6. `Unit`
7. `Process_Code`

制約:

1. `Recipe_ID`: `Recipes.Recipe_ID` に存在すること
2. `Ingredient_No`: 正の整数、同一 `Recipe_ID` 内で重複禁止
3. `Food_ID`: 空欄禁止
4. `Ingredient_Name`: 空欄禁止
5. `Amount_Value`: 正の数値
6. `Unit`: `g` または `ml` のみ
7. `Process_Code`: 定義済みコードのみ

数量管理方式は `Amount_Value + Unit` で固定する。`Amount_g` は不採用とする。  
`Unit` の正式値は `ml` であり、`㎖` は不採用とする。

### 4.3 `Steps`
必須列（列順固定）:

1. `Recipe_ID`
2. `Step_No`
3. `Instruction`

制約:

1. `Recipe_ID`: `Recipes.Recipe_ID` に存在すること
2. `Step_No`: 正の整数、同一 `Recipe_ID` 内で重複禁止
3. `Instruction`: 空欄禁止

## 5. 列定義一覧
### 5.1 Recipes
| 列名 | 型 | 必須 | 制約 |
|---|---|---|---|
| `Recipe_ID` | 文字列 | 必須 | 空欄禁止、一意 |
| `Recipe_Name` | 文字列 | 必須 | 空欄禁止 |
| `Category_Code` | 文字列(enum) | 必須 | 8分類から1つのみ |
| `Servings` | 整数 | 必須 | 正の整数 |
| `Tags` | 文字列(list) | 必須 | `|` 区切り、1〜5個、16タグ内のみ |

### 5.2 Ingredients
| 列名 | 型 | 必須 | 制約 |
|---|---|---|---|
| `Recipe_ID` | 文字列 | 必須 | `Recipes.Recipe_ID` 参照必須 |
| `Ingredient_No` | 整数 | 必須 | 正の整数、同一 `Recipe_ID` で一意 |
| `Food_ID` | 文字列 | 必須 | 空欄禁止 |
| `Ingredient_Name` | 文字列 | 必須 | 空欄禁止 |
| `Amount_Value` | 数値 | 必須 | 正の数値 |
| `Unit` | 文字列(enum) | 必須 | `g` / `ml` のみ |
| `Process_Code` | 文字列(enum) | 必須 | 8コード内のみ |

### 5.3 Steps
| 列名 | 型 | 必須 | 制約 |
|---|---|---|---|
| `Recipe_ID` | 文字列 | 必須 | `Recipes.Recipe_ID` 参照必須 |
| `Step_No` | 整数 | 必須 | 正の整数、同一 `Recipe_ID` で一意 |
| `Instruction` | 文字列 | 必須 | 空欄禁止 |

## 6. Enum / 許可値定義
### 6.1 `Category_Code`（8分類固定）

1. `rice`
2. `noodle`
3. `main_dish`
4. `side_dish`
5. `soup`
6. `snack`
7. `drink`
8. `dessert`

ルール:

1. 1レシピ1カテゴリ
2. 複数カテゴリ禁止
3. 未定義カテゴリは invalid

### 6.2 `Tags`（16個固定）

1. `breakfast`
2. `lunch`
3. `dinner`
4. `snack_time`
5. `lunchbox`
6. `pre_game`
7. `post_game`
8. `weight_gain`
9. `weight_loss`
10. `recovery`
11. `high_protein`
12. `high_carb`
13. `iron_focus`
14. `calcium_focus`
15. `quick`
16. `low_cost`

ルール:

1. `|` 区切り
2. 1〜5個
3. 未定義タグは invalid
4. `batch_cook` は採用しない

### 6.3 `Process_Code`（8種類固定）

1. `RAW`
2. `BOIL`
3. `STEAM`
4. `GRILL`
5. `FRY`
6. `SAUTE`
7. `MICROWAVE`
8. `BAKE`

### 6.4 `Unit`（2種類固定）

1. `g`
2. `ml`

`ml` が正式値であり、`㎖` は不採用とする。

## 7. Unit 運用ルール
`Unit` は物理的な液体/固体分類ではなく、入力一貫性を優先した管理上の分類として運用する。  
許可値は `g` / `ml` のみとする。

`ml` で扱う代表例:

1. 水
2. 牛乳
3. 豆乳
4. 酒
5. みりん
6. 酢
7. しょうゆ
8. めんつゆ

`g` で扱う代表例:

1. 味噌
2. ヨーグルト
3. はちみつ
4. マヨネーズ
5. ケチャップ
6. ソース
7. 砂糖
8. 塩
9. オリーブ油
10. ごま油

重要規則:

1. 油は液体でも `g` に分類する
2. 上記分類に従い、物理状態による例外判定は行わない

## 8. バリデーションルール
検証は以下をすべて満たした場合にのみ valid とする。

1. ワークブックは3シートのみであること（`Recipes` / `Ingredients` / `Steps`）
2. 各シートの必須列名と列順が仕様と完全一致すること
3. 参照整合性:
   1. `Ingredients.Recipe_ID` は `Recipes.Recipe_ID` に存在
   2. `Steps.Recipe_ID` は `Recipes.Recipe_ID` に存在
4. 一意性:
   1. `Recipes.Recipe_ID` は一意
   2. (`Ingredients.Recipe_ID`, `Ingredient_No`) は一意
   3. (`Steps.Recipe_ID`, `Step_No`) は一意
5. 値制約:
   1. `Servings` は正の整数
   2. `Amount_Value` は正の数値
   3. `Category_Code` は8分類内
   4. `Tags` は16タグ内、1〜5個、`|` 区切り
   5. `Process_Code` は8種類内
   6. `Unit` は `g` / `ml` のみ
6. 欠損制約:
   1. `Recipe_Name` 空欄禁止
   2. `Food_ID` 空欄禁止
   3. `Ingredient_Name` 空欄禁止
   4. `Instruction` 空欄禁止
7. 数量列は `Amount_Value + Unit` 方式のみを許可し、`Amount_g` を使用しないこと
8. `ml` は正式値、`㎖` は invalid とする

## 9. invalid となる代表例
以下は canonical spec v1.0 に対して invalid と判定される。

1. シート名不一致（例: `Recipe` シート）
2. `Recipes` の必須列欠落
3. `Category_Code=salad` のような未定義カテゴリ
4. `Tags` に未定義値（例: `batch_cook`）または6個以上のタグ
5. `Servings=2.5` や `Servings=two` のような非整数
6. `Unit=kg` や `Unit=㎖`
7. `Process_Code=SIMMER` など未定義コード
8. 同一 `Recipe_ID` で `Ingredient_No` 重複
9. `Food_ID` 空欄
10. 同一 `Recipe_ID` で `Step_No` 重複

## 10. v1.0 変更管理方針
v1.0 の内容は固定仕様とする。  
以下の変更は v1.0 互換範囲外とし、別バージョン（v1.1 以降）でのみ扱う。

1. シート追加・削除・改名
2. 必須列の追加・削除・改名・順序変更
3. Enum 値（`Category_Code` / `Tags` / `Process_Code` / `Unit`）の追加・削除・改名
4. 数量管理方式の変更（`Amount_Value + Unit` 以外への変更）

運用ルール:

1. 仕様変更提案は文書で管理する
2. 変更が承認されるまでは v1.0 を正として運用する
3. 変更時は canonical template と validator/loader の追随計画を同時に定義する
