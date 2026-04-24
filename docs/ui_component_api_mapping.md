# UI Component API Mapping

## Purpose
Map UI components to API fields so frontend implementation can start immediately with low ambiguity.

## 1) Recipe List Screen

### Search Bar
- component_name: `recipe_search_filters`
- source_api: `GET /recipes`
- request_dependency: `meal_type`, `tags`, nutrition filters
- response_fields: `total`
- display_purpose: filter + result count context
- empty_state: keep current filters visible
- error_state: show inline validation error
- implementation_note: debounce input; reset `offset` to 0 on filter change

### Filter Chips/Dropdowns
- component_name: `filter_controls`
- source_api: `GET /meta/options` + `GET /recipes`
- request_dependency: selected option `code`
- response_fields: `meal_type[]`, `scene[]`, `tags_recommended`
- display_purpose: fixed options
- empty_state: fallback to cached options
- error_state: disable optional filters if options unavailable
- implementation_note: render `label_ja`, submit `code`

### Recipe Card
- component_name: `recipe_card`
- source_api: `GET /recipes`
- request_dependency: none
- response_fields: `items[].recipe_id`, `recipe_name`, `category_lv1/2`, `energy_kcal`, `protein_g`, `fat_g`, `carbohydrate_g`, `tags`
- display_purpose: summary card
- empty_state: no cards
- error_state: list-level error banner
- implementation_note: click card by `recipe_id`

### Pagination
- component_name: `pagination_footer`
- source_api: `GET /recipes`
- request_dependency: `limit`, `offset`
- response_fields: `total`, `limit`, `offset`
- display_purpose: next/prev control
- empty_state: hidden when `total=0`
- error_state: keep last successful page state
- implementation_note: server values are source of truth

### Empty / Loading / Error
- component_name: `list_state_panel`
- source_api: `GET /recipes`
- request_dependency: current filters
- response_fields: `total`, error `{error_code, detail}`
- display_purpose: state messaging
- empty_state: "条件を変更してください"
- error_state: map `VALIDATION_ERROR`
- implementation_note: do not treat empty as error

## 2) Recipe Detail Screen

### Header
- component_name: `recipe_detail_header`
- source_api: `GET /recipes/{recipe_id}`
- request_dependency: `recipe_id`
- response_fields: `recipe_name`, `category_lv1/2/3`, `tags`
- display_purpose: title and category chips
- empty_state: N/A
- error_state: 404 fallback panel
- implementation_note: allow back navigation preserving list filters

### Nutrition Panel
- component_name: `nutrition_panel`
- source_api: `GET /recipes/{recipe_id}`
- request_dependency: `recipe_id`
- response_fields: `energy_kcal`, `protein_g`, `fat_g`, `carbohydrate_g`
- display_purpose: nutrition summary
- empty_state: show "情報なし"
- error_state: detail-level fallback
- implementation_note: fixed decimal formatting

### Ingredients List
- component_name: `ingredients_list`
- source_api: `GET /recipes/{recipe_id}`
- request_dependency: `recipe_id`
- response_fields: `ingredients[].line_no`, `ingredient_name`, `amount_value`, `unit`, `weight_g`, `notes`
- display_purpose: materials section
- empty_state: show empty message
- error_state: inherit page-level error
- implementation_note: sort already provided by API; display `amount_value unit` when present, otherwise fallback to `weight_g`

### Steps List
- component_name: `steps_list`
- source_api: `GET /recipes/{recipe_id}`
- request_dependency: `recipe_id`
- response_fields: `steps[].step_number`, `instruction`
- display_purpose: cooking steps
- empty_state: show empty message
- error_state: inherit page-level error
- implementation_note: numbered timeline UI

## 3) Menu Condition Input Screen

### Kcal Input
- component_name: `target_kcal_input`
- source_api: `POST /menu/generate`
- request_dependency: `target_kcal`
- response_fields: error `VALIDATION_ERROR` detail
- display_purpose: target energy input
- empty_state: default suggestion
- error_state: field-level error
- implementation_note: positive number validation before send

### Protein Input
- component_name: `target_protein_input`
- source_api: `POST /menu/generate`
- request_dependency: `target_protein_g`
- response_fields: error `VALIDATION_ERROR` detail
- display_purpose: target protein input
- empty_state: default suggestion
- error_state: field-level error
- implementation_note: non-negative validation before send

### Scene / Meal Type Selectors
- component_name: `scene_selector`, `meal_type_selector`
- source_api: `GET /meta/options` + `POST /menu/generate`
- request_dependency: selected `code`
- response_fields: `scene[]`, `meal_type[]`
- display_purpose: constrained selection
- empty_state: fallback to cached options
- error_state: disable selector on hard failure
- implementation_note: code submit + label display

### Dessert Toggle
- component_name: `dessert_toggle`
- source_api: `POST /menu/generate`
- request_dependency: `include_dessert`
- response_fields: `patterns[].slots`
- display_purpose: include/exclude dessert
- empty_state: default true
- error_state: keep value on retry
- implementation_note: explicit boolean send

## 4) Menu Result Screen

### Pattern Cards
- component_name: `menu_pattern_cards`
- source_api: `POST /menu/generate`
- request_dependency: generation request payload
- response_fields: `patterns[].pattern_no`, `slots`, `total_kcal`, `total_protein_g`
- display_purpose: 3-candidate comparison
- empty_state: show no-candidate panel
- error_state: map `NO_RECIPES_FOUND`
- implementation_note: stable card order by `pattern_no`

### Nutrition Gap Panel
- component_name: `nutrition_gap_panel`
- source_api: `POST /menu/generate`
- request_dependency: none
- response_fields: `nutrition_summary.target_*`, `actual_*`, `*_gap`
- display_purpose: target vs actual explanation
- empty_state: hide if pattern missing
- error_state: inherit page-level
- implementation_note: color by positive/negative gap

### Constraint Evaluation
- component_name: `constraint_badges`
- source_api: `POST /menu/generate`
- request_dependency: none
- response_fields: `constraint_evaluation.kcal_match_level`, `protein_match_level`, `constraint_relaxed`
- display_purpose: match quality and relaxation status
- empty_state: hide if pattern missing
- error_state: inherit page-level
- implementation_note: map levels to badge colors

### Applied Conditions + Note
- component_name: `applied_conditions_panel`
- source_api: `POST /menu/generate`
- request_dependency: none
- response_fields: `applied_conditions.*`, `generation_note`
- display_purpose: explain why this pattern was generated
- empty_state: fallback label
- error_state: inherit page-level
- implementation_note: show normalized values in developer mode if needed

### Relaxation Banner / Retry CTA
- component_name: `relaxation_banner`
- source_api: `POST /menu/generate`
- request_dependency: none
- response_fields: `constraint_evaluation.constraint_relaxed`, `error_code`
- display_purpose: inform user and guide next action
- empty_state: hidden when false
- error_state: show retry and condition edit CTA
- implementation_note: pair with quick condition adjustment chips

## Loading / Empty / Error Principles
- loading:
  - optimistic skeleton for list/cards
- empty:
  - treat as normal user journey
- error:
  - use `error_code` mapping first, `detail` as supplemental

## Implementation Priority
1. Common API handler + unified error mapper
2. `/meta/options` cache module
3. Recipe list/detail screens
4. Menu input/result with explainability UI
5. Shared empty/loading/error components

## Related Docs
- `docs/frontend_common_api_handler_guide.md`
- `docs/frontend_api_integration_guide.md`
- `docs/error_ui_mapping_guide.md`
