BEGIN;

CREATE TABLE IF NOT EXISTS recipes (
    recipe_id TEXT PRIMARY KEY,
    recipe_name TEXT NOT NULL,
    category_lv1 TEXT NOT NULL,
    category_lv2 TEXT NOT NULL,
    category_lv3 TEXT NULL,
    energy_kcal NUMERIC(10,2) NOT NULL,
    protein_g NUMERIC(10,2) NOT NULL,
    fat_g NUMERIC(10,2) NOT NULL,
    carbohydrate_g NUMERIC(10,2) NOT NULL,
    p_ratio NUMERIC(10,2) NOT NULL,
    f_ratio NUMERIC(10,2) NOT NULL,
    c_ratio NUMERIC(10,2) NOT NULL,
    tags TEXT NULL,
    cooking_method TEXT NULL,
    notes TEXT NULL,
    source_file TEXT NOT NULL,
    source_batch TEXT NOT NULL,
    qa_status TEXT NOT NULL,
    version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_recipes_qa_status
        CHECK (qa_status IN ('passed', 'manual_review', 'failed')),
    CONSTRAINT ck_recipes_energy_non_negative
        CHECK (energy_kcal >= 0),
    CONSTRAINT ck_recipes_protein_non_negative
        CHECK (protein_g >= 0),
    CONSTRAINT ck_recipes_fat_non_negative
        CHECK (fat_g >= 0),
    CONSTRAINT ck_recipes_carbohydrate_non_negative
        CHECK (carbohydrate_g >= 0),
    CONSTRAINT ck_recipes_p_ratio_non_negative
        CHECK (p_ratio >= 0),
    CONSTRAINT ck_recipes_f_ratio_non_negative
        CHECK (f_ratio >= 0),
    CONSTRAINT ck_recipes_c_ratio_non_negative
        CHECK (c_ratio >= 0)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id BIGSERIAL PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    ingredient_name TEXT NOT NULL,
    ingredient_alias TEXT NULL,
    food_id TEXT NULL,
    process TEXT NULL,
    weight_g NUMERIC(10,2) NULL,
    amount_value NUMERIC(10,2) NULL,
    unit TEXT NULL,
    notes TEXT NULL,
    source_file TEXT NOT NULL,
    source_batch TEXT NOT NULL,
    qa_status TEXT NOT NULL,
    version TEXT NOT NULL,
    CONSTRAINT uq_recipe_ingredients_recipe_line_no UNIQUE (recipe_id, line_no),
    CONSTRAINT ck_recipe_ingredients_line_no_positive
        CHECK (line_no >= 1),
    CONSTRAINT ck_recipe_ingredients_weight_positive
        CHECK (weight_g IS NULL OR weight_g > 0),
    CONSTRAINT ck_recipe_ingredients_amount_value_positive
        CHECK (amount_value IS NULL OR amount_value > 0),
    CONSTRAINT ck_recipe_ingredients_unit
        CHECK (unit IS NULL OR unit IN ('g', 'ml')),
    CONSTRAINT ck_recipe_ingredients_qa_status
        CHECK (qa_status IN ('passed', 'manual_review', 'failed'))
);

ALTER TABLE IF EXISTS recipe_ingredients
    ADD COLUMN IF NOT EXISTS food_id TEXT NULL;

ALTER TABLE IF EXISTS recipe_ingredients
    ADD COLUMN IF NOT EXISTS process TEXT NULL;

CREATE TABLE IF NOT EXISTS recipe_steps (
    id BIGSERIAL PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    source_file TEXT NOT NULL,
    source_batch TEXT NOT NULL,
    qa_status TEXT NOT NULL,
    version TEXT NOT NULL,
    CONSTRAINT uq_recipe_steps_recipe_step_number UNIQUE (recipe_id, step_number),
    CONSTRAINT ck_recipe_steps_step_number_min
        CHECK (step_number >= 1),
    CONSTRAINT ck_recipe_steps_qa_status
        CHECK (qa_status IN ('passed', 'manual_review', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_recipes_category_lv1 ON recipes(category_lv1);
CREATE INDEX IF NOT EXISTS idx_recipes_category_lv2 ON recipes(category_lv2);
CREATE INDEX IF NOT EXISTS idx_recipes_qa_status ON recipes(qa_status);
CREATE INDEX IF NOT EXISTS idx_recipes_protein_g ON recipes(protein_g);
CREATE INDEX IF NOT EXISTS idx_recipes_fat_g ON recipes(fat_g);
CREATE INDEX IF NOT EXISTS idx_recipes_carbohydrate_g ON recipes(carbohydrate_g);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON recipe_steps(recipe_id);

COMMENT ON COLUMN recipes.tags IS
'Phase3 keeps tags as TEXT. Future migration can move to JSONB or a normalized tag table.';

COMMIT;
