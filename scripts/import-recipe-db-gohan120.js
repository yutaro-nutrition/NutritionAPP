const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = process.cwd();
const INPUT_XLSX = path.join(ROOT, "recipe_db_gohan_120.xlsx");
const OUT_DIR = path.join(ROOT, "src", "data", "gohan120");

function toNumber(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toString(v) {
  return String(v ?? "").trim();
}

function readSheetObjects(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function main() {
  if (!fs.existsSync(INPUT_XLSX)) {
    throw new Error(`Input file not found: ${INPUT_XLSX}`);
  }

  const wb = XLSX.readFile(INPUT_XLSX, { cellText: true, cellDates: false });
  const recipeRows = readSheetObjects(wb, "Recipe_Master");
  const ingredientRows = readSheetObjects(wb, "Ingredients");
  const stepRows = readSheetObjects(wb, "Steps");

  const recipeMaster = recipeRows.map((r) => {
    const protein = toNumber(r["PROT-"]);
    const fat = toNumber(r["FAT-"]);
    const carb = toNumber(r["CHOCDF-"]);
    const pKcal = protein * 4;
    const fKcal = fat * 9;
    const cKcal = carb * 4;
    const total = Math.max(1, pKcal + fKcal + cKcal);
    return {
      recipe_id: toString(r["Recipe_ID"]),
      recipe_name: toString(r["Recipe_Name"]),
      category: toString(r["Category"]),
      subcategory: toString(r["Subcategory"]),
      rice_type: toString(r["Rice_Type"]),
      cooking_method: toString(r["Cooking_Method"]),
      servings: toNumber(r["Servings"]),
      ingredient_count: toNumber(r["Ingredient_Count"]),
      total_raw_weight_g: toNumber(r["Total_Raw_Weight_g"]),
      total_final_weight_g: toNumber(r["Total_Final_Weight_g"]),
      nutrients_per_serving: {
        enerc_kj: toNumber(r["ENERC"]),
        enerc_kcal: toNumber(r["ENERC_KCAL"]),
        water_g: toNumber(r["WATER"]),
        protein_g: protein,
        fat_g: fat,
        carb_g: carb,
        calcium_mg: toNumber(r["CA"]),
        iron_mg: toNumber(r["FE"]),
        salt_g: toNumber(r["NACL_EQ"]),
        vitamin_b1_mg: toNumber(r["THIA"]),
        vitamin_b2_mg: toNumber(r["RIBF"]),
        vitamin_b6_mg: toNumber(r["VITB6A"]),
        vitamin_b12_ug: toNumber(r["VITB12"]),
        vitamin_c_mg: toNumber(r["VITC"]),
        vitamin_d_ug: toNumber(r["VITD"]),
        retinol_activity_equivalent_ug: toNumber(r["VITA_RAE"]),
      },
      pfc_ratio_percent: {
        protein: Number(((pKcal / total) * 100).toFixed(1)),
        fat: Number(((fKcal / total) * 100).toFixed(1)),
        carb: Number(((cKcal / total) * 100).toFixed(1)),
      },
    };
  });

  const ingredients = ingredientRows.map((r) => ({
    recipe_id: toString(r["Recipe_ID"]),
    recipe_name: toString(r["Recipe_Name"]),
    ingredient_no: toNumber(r["Ingredient_No"]),
    ingredient_group: toString(r["Ingredient_Group"]),
    food_code: toString(r["Food_Code"]),
    food_name: toString(r["Food_Name"]),
    ingredient_display: toString(r["Ingredient_Display"]),
    raw_weight_g: toNumber(r["Raw_Weight_g"]),
    edible_ratio: toNumber(r["Edible_Ratio"]),
    edible_weight_g: toNumber(r["Edible_Weight_g"]),
    yield_factor: toNumber(r["Yield_Factor"]),
    retention_profile: toString(r["Retention_Profile"]),
    final_weight_g: toNumber(r["Final_Weight_g"]),
    energy_retention: toNumber(r["Energy_Retention"]),
    protein_retention: toNumber(r["Protein_Retention"]),
    fat_retention: toNumber(r["Fat_Retention"]),
    carb_retention: toNumber(r["Carb_Retention"]),
    vitamin_retention: toNumber(r["Vitamin_Retention"]),
    mineral_retention: toNumber(r["Mineral_Retention"]),
    b1_retention: toNumber(r["B1_Retention"]),
    b2_retention: toNumber(r["B2_Retention"]),
    b6_retention: toNumber(r["B6_Retention"]),
    b12_retention: toNumber(r["B12_Retention"]),
    c_retention: toNumber(r["C_Retention"]),
    d_retention: toNumber(r["D_Retention"]),
    rae_retention: toNumber(r["RAE_Retention"]),
    salt_retention: toNumber(r["Salt_Retention"]),
  }));

  const steps = stepRows.map((r) => ({
    recipe_id: toString(r["Recipe_ID"]),
    recipe_name: toString(r["Recipe_Name"]),
    step_no: toNumber(r["Step_No"]),
    step_description: toString(r["Step_Description"]),
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "recipe_master_gohan120.json"), JSON.stringify(recipeMaster, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "ingredients_gohan120.json"), JSON.stringify(ingredients, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "steps_gohan120.json"), JSON.stringify(steps, null, 2), "utf8");

  const report = {
    source_file: "recipe_db_gohan_120.xlsx",
    imported_at: new Date().toISOString(),
    recipe_count: recipeMaster.length,
    ingredient_row_count: ingredients.length,
    step_row_count: steps.length,
    missing_recipe_ids_in_ingredients: recipeMaster.filter((r) => !ingredients.some((i) => i.recipe_id === r.recipe_id)).map((r) => r.recipe_id),
    missing_recipe_ids_in_steps: recipeMaster.filter((r) => !steps.some((s) => s.recipe_id === r.recipe_id)).map((r) => r.recipe_id),
  };
  fs.writeFileSync(path.join(OUT_DIR, "import_report_gohan120.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(report);
}

main();

