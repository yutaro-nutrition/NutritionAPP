BEGIN;

ALTER TABLE IF EXISTS recipe_ingredients
    ADD COLUMN IF NOT EXISTS amount_value NUMERIC(10,2) NULL;

ALTER TABLE IF EXISTS recipe_ingredients
    ADD COLUMN IF NOT EXISTS unit TEXT NULL;

ALTER TABLE IF EXISTS recipe_ingredients
    ALTER COLUMN weight_g DROP NOT NULL;

UPDATE recipe_ingredients
SET amount_value = weight_g
WHERE amount_value IS NULL AND weight_g IS NOT NULL;

UPDATE recipe_ingredients
SET unit = 'g'
WHERE unit IS NULL AND weight_g IS NOT NULL;

ALTER TABLE IF EXISTS recipe_ingredients
    DROP CONSTRAINT IF EXISTS ck_recipe_ingredients_weight_positive;

ALTER TABLE IF EXISTS recipe_ingredients
    ADD CONSTRAINT ck_recipe_ingredients_weight_positive
    CHECK (weight_g IS NULL OR weight_g > 0);

ALTER TABLE IF EXISTS recipe_ingredients
    DROP CONSTRAINT IF EXISTS ck_recipe_ingredients_amount_value_positive;

ALTER TABLE IF EXISTS recipe_ingredients
    ADD CONSTRAINT ck_recipe_ingredients_amount_value_positive
    CHECK (amount_value IS NULL OR amount_value > 0);

ALTER TABLE IF EXISTS recipe_ingredients
    DROP CONSTRAINT IF EXISTS ck_recipe_ingredients_unit;

ALTER TABLE IF EXISTS recipe_ingredients
    ADD CONSTRAINT ck_recipe_ingredients_unit
    CHECK (unit IS NULL OR unit IN ('g', 'ml'));

COMMIT;
