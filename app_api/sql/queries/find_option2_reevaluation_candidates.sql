-- Option 2 re-evaluation candidate extraction (read-only)
-- Purpose:
--   Identify rows that require manual re-evaluation or reimport decision
--   after removing unsafe ml->g 1:1 conversion.
-- Important:
--   This query does NOT modify data.

WITH c1_ml_with_weight AS (
    SELECT
        'C1_ML_HAS_WEIGHT_G'::text AS candidate_type,
        ri.recipe_id,
        ri.line_no,
        ri.food_id,
        ri.ingredient_name,
        ri.amount_value,
        ri.unit,
        ri.weight_g,
        ri.source_file,
        ri.source_batch,
        'unit=ml but weight_g is populated. Possible legacy 1:1 artifact.'::text AS reason
    FROM recipe_ingredients ri
    WHERE ri.unit = 'ml'
      AND ri.weight_g IS NOT NULL
),
c2_raw_missing AS (
    SELECT
        'C2_RAW_MISSING'::text AS candidate_type,
        ri.recipe_id,
        ri.line_no,
        ri.food_id,
        ri.ingredient_name,
        ri.amount_value,
        ri.unit,
        ri.weight_g,
        ri.source_file,
        ri.source_batch,
        'amount_value or unit is NULL. Raw canonical retention is incomplete.'::text AS reason
    FROM recipe_ingredients ri
    WHERE ri.amount_value IS NULL
       OR ri.unit IS NULL
),
c3_possible_liquid_migrated_as_g AS (
    SELECT
        'C3_POSSIBLE_LIQUID_MIGRATED_AS_G'::text AS candidate_type,
        ri.recipe_id,
        ri.line_no,
        ri.food_id,
        ri.ingredient_name,
        ri.amount_value,
        ri.unit,
        ri.weight_g,
        ri.source_file,
        ri.source_batch,
        'Heuristic: liquid-like ingredient name with unit=g and amount_value=weight_g. Needs original workbook check.'::text AS reason
    FROM recipe_ingredients ri
    WHERE ri.unit = 'g'
      AND ri.amount_value IS NOT NULL
      AND ri.weight_g IS NOT NULL
      AND ri.amount_value = ri.weight_g
      AND (
          ri.ingredient_name ILIKE '%水%'
          OR ri.ingredient_name ILIKE '%牛乳%'
          OR ri.ingredient_name ILIKE '%豆乳%'
          OR ri.ingredient_name ILIKE '%酒%'
          OR ri.ingredient_name ILIKE '%みりん%'
          OR ri.ingredient_name ILIKE '%酢%'
          OR ri.ingredient_name ILIKE '%しょうゆ%'
          OR ri.ingredient_name ILIKE '%醤油%'
          OR ri.ingredient_name ILIKE '%めんつゆ%'
      )
)
SELECT * FROM c1_ml_with_weight
UNION ALL
SELECT * FROM c2_raw_missing
UNION ALL
SELECT * FROM c3_possible_liquid_migrated_as_g
ORDER BY candidate_type, recipe_id, line_no;
