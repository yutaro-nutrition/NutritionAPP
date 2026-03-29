# Frontend Common API Handler Guide

## Purpose
Define a framework-neutral API handler contract that can be used in React and Flutter projects without changing backend APIs.

## 1. Handler Responsibilities

### 1.1 Request Side
- Manage base URL by environment (`dev/stg/prod`).
- Attach common headers (`Content-Type`, optional app-version).
- Serialize query/body consistently.
- Enforce request timeout (recommended: 8-15 sec).
- Generate local request trace id for logs.

### 1.2 Response Side
- Parse JSON for all API responses.
- Distinguish success and error by HTTP status.
- For errors, read in this order:
  1. status code
  2. `error_code`
  3. `detail`
- Route-level UI branching should use `error_code` as primary key.

### 1.3 Error Handling
- Normalize error output to one frontend shape:
  - `status`
  - `error_code`
  - `detail`
  - `is_network_error`
  - `is_timeout`
  - `request_trace_id`
- Keep `detail` as supplemental context, not as branching key.

### 1.4 Retry Decision
- Automatic retry (limited, idempotent reads only):
  - network timeout
  - temporary connectivity failure
  - `5xx` (if introduced later)
- Manual retry recommended:
  - `INVALID_PARAMETER`, `VALIDATION_ERROR`, `NO_RECIPES_FOUND`, `MENU_GENERATION_FAILED`
- Do not retry automatically:
  - `RECIPE_NOT_FOUND`

### 1.5 Logging Policy
- Log minimal fields:
  - endpoint, method, status, error_code, elapsed_ms, request_trace_id
- For menu requests include:
  - `target_kcal`, `target_protein_g`, `scene`, `meal_type`, `include_dessert`
- Avoid personal/sensitive data.

### 1.6 Future-ready Slot (`request_id`)
- If backend later returns `request_id`, handler should pass-through without breaking existing interface.
- Recommendation: keep optional `server_request_id` field in frontend error/success envelope.

## 2. Error Processing Flow (Common)
1. Check status code class (2xx / 4xx / 5xx / network).
2. If non-2xx and payload has `error_code`, map by table.
3. Use `detail` for human-readable support message.
4. Return normalized frontend error object.

## 3. `/meta/options` Cache Strategy

### 3.1 Load Timing
- Initial app startup: required.
- Optional refresh trigger:
  - app resume after long idle
  - settings screen open

### 3.2 Multi-layer Cache
- L1 memory cache for current session.
- L2 persistent cache for cold start fallback.

### 3.3 TTL Recommendation
- Default: 24h TTL.
- If stale and network available: background refresh.
- If stale and network unavailable: use stale cache + warning log.

### 3.4 Invalidation Triggers
- App version change.
- Manual "refresh options" action.
- Cache parse failure.

### 3.5 Fallback Rule
- API failure + valid cache: continue with cache.
- API failure + no cache: show retry/limited mode message.

### 3.6 Value Usage Rule
- Display: `label_ja`
- Send to API: `code`
- Preserve alias list for compatibility/help text.

## 4. Implementation-neutral Interface Suggestion
- `getOptions(): Promise<OptionsModel>`
- `searchRecipes(params): Promise<RecipeListModel>`
- `getRecipeDetail(id): Promise<RecipeDetailModel>`
- `generateMenu(params): Promise<MenuResultModel>`
- Each function throws/returns normalized `ApiErrorModel` on failure.

## 5. Notes for React / Flutter
- React:
  - centralize in one API client module + query cache layer.
- Flutter:
  - centralize in repository layer + state notifier/provider.
- Shared rule:
  - same error mapping table and same options cache policy.

## Related Docs
- `docs/frontend_api_integration_guide.md`
- `docs/error_ui_mapping_guide.md`
- `docs/ui_component_api_mapping.md`
