# Error UI Mapping Guide

## Goal
Define stable UI behavior by `error_code` so frontend teams can implement consistent screens and retry flows.

## Error Response Contract
```json
{
  "error_code": "VALIDATION_ERROR",
  "detail": "..."
}
```

Use `error_code` for branching and `detail` for supplemental context.

## Mapping Table

### `RECIPE_NOT_FOUND`
- Typical source: `GET /recipes/{recipe_id}` with invalid/missing ID.
- User message example:
  - "レシピが見つかりませんでした。一覧から選び直してください。"
- UI action:
  - show toast/banner
  - provide "一覧へ戻る" button
- Retry:
  - No immediate retry; user needs new ID/path.
- Developer note:
  - log route param and navigation source.

### `INVALID_PARAMETER`
- Typical source: invalid request to `/menu/generate` or malformed params.
- User message example:
  - "入力条件を確認してください。"
- UI action:
  - highlight invalid fields
  - preserve entered values
- Retry:
  - Yes, after correction.
- Developer note:
  - log payload snapshot (non-sensitive) and validation context.

### `MENU_GENERATION_FAILED`
- Typical source: internal generation failure (unexpected).
- User message example:
  - "献立の作成に失敗しました。しばらくしてから再試行してください。"
- UI action:
  - show retry button
  - offer return to condition screen
- Retry:
  - Yes.
- Developer note:
  - log full request context and request id.

### `NO_RECIPES_FOUND`
- Typical source: `/menu/generate` no candidate patterns under constraints.
- User message example:
  - "条件に合う候補が見つかりませんでした。条件を少し緩めて再実行してください。"
- UI action:
  - show quick chips: "+100 kcal", "protein -5g", "scene 解除"
- Retry:
  - Yes, recommended after parameter adjustment.
- Developer note:
  - log scene/meal_type/include_dessert and targets.

### `VALIDATION_ERROR`
- Typical source: request schema/query validation failure (`422`).
- User message example:
  - "入力形式に誤りがあります。"
- UI action:
  - map field-level errors to form hints
  - focus first invalid field
- Retry:
  - Yes, immediate after correction.
- Developer note:
  - log parsed validation details for QA.

## Logging Strategy
- Minimum log fields:
  - `endpoint`, `method`, `error_code`, `status_code`, timestamp
- For generation:
  - include target values and selected option codes
- Avoid:
  - logging sensitive personal data if introduced later

## Retry Strategy (UI)
- Retry recommended:
  - `INVALID_PARAMETER`, `MENU_GENERATION_FAILED`, `NO_RECIPES_FOUND`, `VALIDATION_ERROR`
- Retry not useful without context change:
  - `RECIPE_NOT_FOUND`

## UX Copy Guideline
- Show user-friendly Japanese message first.
- Keep technical `detail` in expandable section or logs.
- Use consistent wording across screens.

## Related Docs
- `docs/frontend_api_integration_guide.md`
- `docs/api_menu_mvp_spec.md`
- `docs/frontend_common_api_handler_guide.md`
