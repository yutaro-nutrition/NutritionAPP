# 1. 文書の目的
- 本書は、献立アプリMVP（3画面: 条件入力・候補一覧・レシピ詳細）に必要なAPI契約を実装前に固定するための文書である。
- 対象は以下の2APIのみとする。
  - 献立候補一覧取得API
  - レシピ詳細取得API
- 本書は文書化のみを目的とし、実装コード作成や機能拡張は行わない。

# 2. 参照文書
- `docs/mvp_requirements_draft.md`
- `docs/screen_io_specification_mvp.md`

# 3. 対象API一覧
| API名 | エンドポイント（MVP契約上） | 用途 |
| --- | --- | --- |
| 献立候補一覧取得API | `POST /api/v1/menu-candidates/search` | 条件入力に基づき候補一覧を取得する |
| レシピ詳細取得API | `GET /api/v1/recipes/{recipe_id}` | 選択した候補の詳細を取得する |

# 4. API設計方針
- MVP範囲は3画面導線成立に必要な最小契約に限定する。
- `target_energy_band` は**外部入力として受け付けない**。API内部で `age`, `sex`, `height_cm`, `weight_kg` から派生算出する。
- エネルギー帯は候補提示の参考帯であり、厳密診断値として扱わない。
- UIから送る入力項目は原則として以下に固定する。
  - `age`, `sex`, `height_cm`, `weight_kg`, `meal_scene`, `purpose`, `cooking_load`, `exclude_ingredients[]`
- `meal_scene` / `purpose` はUI入力値をAPIが直接受ける。DB都合の内部コード（例: `meal_type` / `scene`）への変換はAPI内部マッピングで吸収する。
- 体脂肪率は扱わない。
- 「0件」は正常系レスポンスとする。
- 項目欠損は「API全体失敗」と「項目単位フォールバック」を分離して扱う。
- 栄養項目は一覧API・詳細APIともに `nutrition` ネスト構造で統一し、フラット構造は採用しない。

# 5. 献立候補一覧取得API 契約
## 5.1 API名
- 献立候補一覧取得API

## 5.2 目的
- 条件入力画面で確定した条件から、候補一覧画面に表示する候補を返却する。

## 5.3 呼び出しタイミング
- 条件入力画面で必須項目バリデーション通過後に呼び出す。
- 候補一覧画面の「再試行」操作時に同条件で再呼び出しする。

## 5.4 リクエスト項目一覧
### リクエストボディ
| 項目名 | 型 | 必須/任意 | UI送信値 | バリデーション |
| --- | --- | --- | --- | --- |
| `age` | integer | 必須 | 年齢 | `1 <= age <= 99`（MVP暫定固定値） |
| `sex` | string(enum) | 必須 | 性別 | `male` / `female` のみ受理 |
| `height_cm` | number | 必須 | 身長(cm) | `80 <= height_cm <= 250`（MVP暫定固定値） |
| `weight_kg` | number | 必須 | 体重(kg) | `10 <= weight_kg <= 300` |
| `meal_scene` | string(enum) | 必須 | 食事の場面 | `breakfast` / `lunch` / `dinner` / `snack` |
| `purpose` | string(enum) | 必須 | 目的 | `pre_game` / `post_game` / `bulk_up` / `daily_meal` / `recovery` |
| `cooking_load` | string(enum) | 必須 | 調理負担 | `quick` / `normal` |
| `exclude_ingredients` | string[] | 任意 | 除外食材配列 | 各要素1〜50文字、最大20件、未指定時`[]`。正規化後の完全一致で除外判定 |

### 内部派生値
| 項目名 | 生成元 | 外部入力可否 | 用途 |
| --- | --- | --- | --- |
| `target_energy_band` | `age`, `sex`, `height_cm`, `weight_kg` | 不可（内部のみ） | 候補抽出・並び順の参考帯 |

## 5.5 レスポンス項目一覧
### 正常応答（HTTP 200）
```json
{
  "total": 2,
  "items": [
    {
      "recipe_id": "r_001",
      "name": "鶏むねと野菜の丼",
      "nutrition": {
        "energy_kcal": 620,
        "protein_g": 32.1
      },
      "tags": ["試合後", "夕食"],
      "notes": "高たんぱくで作りやすい",
      "cooking_time_min": 20
    }
  ]
}
```

### `items[]` の最低必要項目
| 項目名 | 必須/任意 | 欠損時の扱い |
| --- | --- | --- |
| `recipe_id` | 必須 | 当該候補を表示対象外（詳細遷移不可のため） |
| `name` | 必須 | 当該候補を表示対象外 |
| `nutrition.energy_kcal` | 必須 | `"-"`表示（候補表示は継続） |
| `nutrition.protein_g` | 必須 | `"-"`表示（候補表示は継続） |
| `tags` | 任意 | `notes`で代替、代替不可なら「用途情報なし」 |
| `notes` | 任意 | `tags`で代替、代替不可なら「特徴情報なし」 |
| `cooking_time_min` | 任意 | 「不明」表示 |

## 5.6 正常応答・0件応答
- 1件以上: `total >= 1` かつ `items.length >= 1`
- 0件: `HTTP 200` で `total = 0`, `items = []`
- 0件は異常ではなく、UIは「該当する献立候補が見つかりませんでした」を表示し、条件見直し導線を出す。

## 5.7 入力不備時のエラー方針
- UIは必須未入力・形式不正時にAPI送信しない。
- APIに不正値が到達した場合は `HTTP 400` + 項目単位エラーを返す。

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値に誤りがあります。",
    "fields": [
      { "name": "age", "reason": "must_be_between_1_and_99" }
    ]
  }
}
```

## 5.8 API失敗時の扱い
- サーバ内部エラー: `HTTP 500`（`INTERNAL_SERVER_ERROR`）
- タイムアウト/一時障害: `HTTP 503`（`SERVICE_UNAVAILABLE`）
- UIは一覧領域に失敗文言を表示し、再試行導線を提供する。

## 5.9 欠損項目がある候補の扱い
- 候補成立に必須な識別項目（`recipe_id`, `name`）欠損時は当該候補を除外。
- `recipe_id` または `name` 欠損候補の欠損カード表示は採用しない。
- 栄養値・補助情報の欠損はプレースホルダ表示で吸収し、一覧全体の成立を優先。

## 5.10 画面との対応関係
- SCR-01（条件入力）: リクエスト生成元
- SCR-02（候補一覧）: レスポンス表示先

## 5.11 備考
- `sex` のUI表示値は、UI内部でAPI受理値へ変換して送信する（対応: 男性→`male`、女性→`female`）。
- `exclude_ingredients[]` は正規化後の完全一致のみで除外判定する。部分一致は採用しない。
- 同義語辞書がある場合のみ内部正規化で吸収する。同義語辞書未対応語は除外漏れが発生しうる。
- 年齢・身長・体重の閾値はMVP暫定固定値であり、業務承認後に見直し可能とする。
- 並び順は「目的整合 > 場面整合 > エネルギー帯近似 > 調理負担整合」を内部ロジック方針とする。

# 6. レシピ詳細取得API 契約
## 6.1 API名
- レシピ詳細取得API

## 6.2 目的
- 候補一覧で選択した `recipe_id` の詳細情報を返却し、採用判断を可能にする。

## 6.3 呼び出しタイミング
- 候補一覧画面で候補選択後、詳細画面表示時に呼び出す。
- 詳細画面の再試行操作時に同一 `recipe_id` で再呼び出しする。

## 6.4 リクエスト項目一覧
| 項目名 | 型 | 必須/任意 | バリデーション |
| --- | --- | --- | --- |
| `recipe_id`（path） | string | 必須 | 空不可、1〜64文字、`^[A-Za-z0-9_-]+$` |

## 6.5 レスポンス項目一覧
### 正常応答（HTTP 200）
```json
{
  "recipe_id": "r_001",
  "name": "鶏むねと野菜の丼",
  "tags": ["試合後", "夕食"],
  "notes": "高たんぱくで作りやすい",
  "ingredients": [
    { "name": "鶏むね肉", "amount": "200g" },
    { "name": "ごはん", "amount": "1膳" }
  ],
  "steps": [
    "鶏むね肉を切る",
    "焼く",
    "ごはんにのせる"
  ],
  "nutrition": {
    "energy_kcal": 620,
    "protein_g": 32.1,
    "fat_g": 14.2,
    "carbohydrate_g": 80.3
  }
}
```

### 詳細画面に必要な最低返却項目
| 項目名 | 必須/任意 | 欠損時の扱い |
| --- | --- | --- |
| `recipe_id` | 必須 | 異常扱い（一覧へ戻る導線表示） |
| `name` | 必須 | 異常扱い（詳細表示中止） |
| `ingredients[]` | 必須 | 0件は異常扱い（データ不備） |
| `ingredients[].name` | 必須 | 欠損行を非表示、全欠損なら異常扱い |
| `ingredients[].amount` | 任意 | 「記載なし」表示 |
| `steps[]` | 必須 | 0件は異常扱い（データ不備） |
| `nutrition.energy_kcal` | 任意 | `"-"`表示 |
| `nutrition.protein_g` | 任意 | `"-"`表示 |
| `nutrition.fat_g` | 任意 | `"-"`表示 |
| `nutrition.carbohydrate_g` | 任意 | `"-"`表示 |
| `tags` | 任意 | `notes`で代替、不可なら「情報なし」 |
| `notes` | 任意 | 欠損時は非表示 |

## 6.6 404時の扱い
- `HTTP 404` + `RECIPE_NOT_FOUND` を返す。
- UIは「対象レシピが見つかりませんでした」を表示し、一覧へ戻る導線を必須表示する。

## 6.7 API失敗時の扱い
- `HTTP 500` / `503` を返却。
- UIは失敗文言、再試行導線、一覧へ戻る導線を表示する。

## 6.8 欠損時の扱い
- 採用判断の根幹項目（`name`, `ingredients[]`, `steps[]`）欠損は詳細成立不可として異常表示。
- それ以外はプレースホルダ表示または非表示で吸収し、可能な範囲で詳細表示を継続する。

## 6.9 画面との対応関係
- SCR-02（候補一覧）: `recipe_id` の発行元
- SCR-03（レシピ詳細）: レスポンス表示先

## 6.10 備考
- 一覧と詳細で `recipe_id` の整合を必須とする。

# 7. エラー応答方針
## 7.1 共通エラー形式
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "利用者向けメッセージ",
    "fields": []
  }
}
```

## 7.2 ステータスとUI方針
| HTTP | code | 主な発生条件 | UI方針 |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 入力値不正 | 項目単位修正案内 |
| 404 | `RECIPE_NOT_FOUND` | 詳細対象なし | 一覧へ戻る導線 |
| 500 | `INTERNAL_SERVER_ERROR` | サーバ内部失敗 | 再試行導線 |
| 503 | `SERVICE_UNAVAILABLE` | 一時障害/タイムアウト | 再試行導線 |

# 8. 欠損データ時の方針
| 項目 | MVP時方針 | 区分 |
| --- | --- | --- |
| 主な用途 | `tags` / `notes` で代替 | 既存データで代替 |
| 簡単な特徴 | `notes` / `tags` で代替 | 既存データで代替 |
| 向いている場面 | `tags` / `notes` で代替 | 既存データで代替 |
| 補足コメント | `notes` を任意表示 | 任意返却 |
| 調理時間目安 | 欠損時「不明」 | 仮表示 |
| 分量 | 欠損時「記載なし」 | 仮表示 |

- 上記6項目はMVPで新規DB追加を前提にしない。
- 主要判断項目は名称・材料・手順を優先し、栄養項目（`nutrition.energy_kcal`, `nutrition.protein_g` を含む）欠損時はプレースホルダ表示で詳細表示を継続する。

# 9. 画面成立に必要な最低データセット
## 9.1 候補一覧画面（SCR-02）
- 正常成立条件
  - `total`（0以上）
  - `items[]`（0件可）
- 候補1件表示に必要な最小項目
  - `recipe_id`, `name`
  - `nutrition.energy_kcal`（欠損時 `"-"`）、`nutrition.protein_g`（欠損時 `"-"`）
- 0件時成立条件
  - `total=0` かつ `items=[]` を正常応答で返すこと

## 9.2 詳細画面（SCR-03）
- 正常成立条件
  - `recipe_id`, `name`, `ingredients[]`, `steps[]`
- 欠損許容
  - `ingredients[].amount`, `nutrition.energy_kcal`, `nutrition.protein_g`, `nutrition.fat_g`, `nutrition.carbohydrate_g`, `notes`, `tags`

# 10. MVP範囲外として扱うAPI
- ログイン/会員
- 課金
- 外部連携
- AIチャット
- お気に入り
- 履歴
- 比較
- 共有
- PDF出力
- 買い物リスト
- 条件保存
- 週間献立
- 自動最適化

# 11. 実装前確認が必要な論点
- 本契約はMVP実装着手可能な確定版とする。
- 数値バリデーション閾値（`age`, `height_cm`, `weight_kg`）はMVP暫定固定値として運用し、業務承認後の改定時は契約書改版で対応する。
- 同義語辞書のメンテナンス範囲は運用課題として管理し、MVP契約自体は「正規化後完全一致」を維持する。
