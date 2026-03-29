\set ON_ERROR_STOP on

BEGIN;

CREATE SCHEMA IF NOT EXISTS mealplan;

CREATE TABLE IF NOT EXISTS mealplan.recipe_master_all (
    recipe_id TEXT PRIMARY KEY,
    recipe_name TEXT,
    category_lv1 TEXT,
    category_lv2 TEXT,
    category_lv3 TEXT,
    energy_kcal DOUBLE PRECISION,
    protein_g DOUBLE PRECISION,
    fat_g DOUBLE PRECISION,
    carbohydrate_g DOUBLE PRECISION,
    p_ratio DOUBLE PRECISION,
    f_ratio DOUBLE PRECISION,
    c_ratio DOUBLE PRECISION,
    tags TEXT,
    cooking_method TEXT,
    notes TEXT,
    source_file TEXT,
    source_batch TEXT,
    qa_status TEXT,
    version TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mealplan.recipe_ingredients_all (
    recipe_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    ingredient_name TEXT,
    ingredient_alias TEXT,
    weight_g DOUBLE PRECISION,
    notes TEXT,
    source_file TEXT,
    source_batch TEXT,
    qa_status TEXT,
    version TEXT,
    PRIMARY KEY (recipe_id, line_no),
    CONSTRAINT fk_recipe_ingredients_recipe_id
      FOREIGN KEY (recipe_id)
      REFERENCES mealplan.recipe_master_all (recipe_id)
      ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mealplan.recipe_steps_all (
    recipe_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    instruction TEXT,
    source_file TEXT,
    source_batch TEXT,
    qa_status TEXT,
    version TEXT,
    PRIMARY KEY (recipe_id, step_number),
    CONSTRAINT fk_recipe_steps_recipe_id
      FOREIGN KEY (recipe_id)
      REFERENCES mealplan.recipe_master_all (recipe_id)
      ON DELETE CASCADE
);

TRUNCATE TABLE
    mealplan.recipe_steps_all,
    mealplan.recipe_ingredients_all,
    mealplan.recipe_master_all
RESTART IDENTITY;

COMMIT;

\copy mealplan.recipe_master_all (
    recipe_id, recipe_name, category_lv1, category_lv2, category_lv3,
    energy_kcal, protein_g, fat_g, carbohydrate_g, p_ratio, f_ratio, c_ratio,
    tags, cooking_method, notes, source_file, source_batch, qa_status, version,
    created_at, updated_at
) FROM :'recipe_master_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

\copy mealplan.recipe_ingredients_all (
    recipe_id, line_no, ingredient_name, ingredient_alias, weight_g, notes,
    source_file, source_batch, qa_status, version
) FROM :'recipe_ingredients_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

\copy mealplan.recipe_steps_all (
    recipe_id, step_number, instruction, source_file, source_batch, qa_status, version
) FROM :'recipe_steps_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
