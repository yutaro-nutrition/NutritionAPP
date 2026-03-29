# API Vocabulary Guide

## Goal
This guide defines recommended vocabulary for `meal_type`, `scene`, and `tags` so frontend fixed options can be implemented consistently.

## Design Principle
- Keep backward compatibility with existing string matching behavior.
- Use stable code values for new UI implementations.
- Keep Japanese labels as display text.

## Meal Type (Recommended)
- `breakfast` (表示例: 朝食)
- `lunch` (表示例: 昼食)
- `dinner` (表示例: 夕食)
- `snack` (表示例: 補食)

Accepted aliases (compatibility):
- `朝食`, `昼食`, `夕食`, `補食`, `補食向け`
- `試合前`, `試合後` (legacy-compatible values)

## Scene (Recommended)
- `pre_game` (表示例: 試合前)
- `post_game` (表示例: 試合後)
- `bulking` (表示例: 増量)
- `cutting` (表示例: 減量)
- `recovery` (表示例: 回復)
- `normal` (表示例: 通常)

Accepted aliases (compatibility):
- `試合前`, `試合後`, `増量`, `増量期`, `減量`, `減量期`, `回復`, `通常`

## Tags (Recommended Groups)
### performance_goal
- `high_protein`
- `low_fat`
- `high_carb`
- `recovery_support`

### timing
- `pre_game`
- `post_game`
- `snack`

### nutrition_feature
- `high_protein`
- `low_fat`
- `high_carb`
- `easy_digest`

### user_need
- `quick_energy`
- `recovery_support`
- `light_meal`

## API Usage
- Reference options from `GET /meta/options`.
- Send code values (`pre_game`, `post_game`, etc.) from frontend.
- If old clients send Japanese values, API keeps compatibility.

## UI Recommendation
- Maintain `{ code, label }` in frontend option store.
- Show localized labels in UI, send `code` to API.
- On menu result, show:
  - `generation_note`
  - `constraint_evaluation.constraint_relaxed`
  - `nutrition_summary` gap values
