-- data_model_audit_queries.sql
-- Read-only audit queries for current recipes/recipe_ingredients/recipe_steps model

-- 1) Parent-child minimum completeness
SELECT r.recipe_id,
       COUNT(DISTINCT i.id) AS ingredient_count,
       COUNT(DISTINCT s.id) AS step_count
FROM recipes r
LEFT JOIN recipe_ingredients i ON i.recipe_id = r.recipe_id
LEFT JOIN recipe_steps s ON s.recipe_id = r.recipe_id
GROUP BY r.recipe_id
HAVING COUNT(DISTINCT i.id) = 0 OR COUNT(DISTINCT s.id) = 0
ORDER BY r.recipe_id;

-- 2) Duplicate child keys (should be empty due to UNIQUE constraints)
SELECT recipe_id, line_no, COUNT(*) AS dup_count
FROM recipe_ingredients
GROUP BY recipe_id, line_no
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, recipe_id, line_no;

SELECT recipe_id, step_number, COUNT(*) AS dup_count
FROM recipe_steps
GROUP BY recipe_id, step_number
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, recipe_id, step_number;

-- 3) Step sequence gaps per recipe
WITH seq AS (
  SELECT recipe_id,
         step_number,
         ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY step_number) AS rn
  FROM recipe_steps
)
SELECT recipe_id, step_number, rn
FROM seq
WHERE step_number <> rn
ORDER BY recipe_id, step_number;

-- 4) Ingredient sequence gaps per recipe
WITH seq AS (
  SELECT recipe_id,
         line_no,
         ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY line_no) AS rn
  FROM recipe_ingredients
)
SELECT recipe_id, line_no, rn
FROM seq
WHERE line_no <> rn
ORDER BY recipe_id, line_no;

-- 5) Nutrition null/zero bias check on parent
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE energy_kcal IS NULL) AS energy_null,
       COUNT(*) FILTER (WHERE protein_g IS NULL) AS protein_null,
       COUNT(*) FILTER (WHERE fat_g IS NULL) AS fat_null,
       COUNT(*) FILTER (WHERE carbohydrate_g IS NULL) AS carb_null,
       COUNT(*) FILTER (WHERE energy_kcal = 0) AS energy_zero,
       COUNT(*) FILTER (WHERE protein_g = 0) AS protein_zero,
       COUNT(*) FILTER (WHERE fat_g = 0) AS fat_zero,
       COUNT(*) FILTER (WHERE carbohydrate_g = 0) AS carb_zero
FROM recipes;

-- 6) Parent update trace proxy (updated_at > created_at)
SELECT recipe_id, recipe_name, created_at, updated_at
FROM recipes
WHERE updated_at > created_at
ORDER BY updated_at DESC
LIMIT 200;

-- 7) Metadata distribution sanity
SELECT source_batch, qa_status, version, COUNT(*) AS cnt
FROM recipes
GROUP BY source_batch, qa_status, version
ORDER BY cnt DESC, source_batch, qa_status, version;

-- 8) Column-loss proxy checks (what remains in ingredients table)
-- If this returns sparse data, canonical detail may have been dropped upstream.
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE ingredient_name IS NULL OR ingredient_name = '') AS ingredient_name_missing,
       COUNT(*) FILTER (WHERE weight_g IS NULL OR weight_g <= 0) AS weight_invalid,
       COUNT(*) FILTER (WHERE notes IS NOT NULL AND notes <> '') AS notes_present
FROM recipe_ingredients;
