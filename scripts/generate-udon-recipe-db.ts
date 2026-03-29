import fs from "fs";
import path from "path";
import XLSX from "xlsx";

type Nutrients = {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  calcium: number;
  iron: number;
  vitaminB1: number;
  vitaminB2: number;
  vitaminB6: number;
  vitaminB12: number;
  vitaminC: number;
  vitaminD: number;
  rae: number;
  salt: number;
};

type Food = Nutrients & {
  foodNo: string;
  foodName: string;
  refusePercent: number;
};

type YieldTable = {
  main: number;
  protein: number;
  vegetable: number;
  seasoning: number;
};

type RetentionTable = Record<"boil" | "stirFry" | "simmer" | "grill", Nutrients>;

type InputIngredientRow = {
  Recipe_ID: string;
  Ingredient_Name: string;
  "Weight(g)": number | string;
  Notes: string;
};

type InputStepRow = {
  Recipe_ID: string;
  Step_Number: number | string;
  Instruction: string;
};

type InputMasterRow = {
  Recipe_ID: string;
  Recipe_Name: string;
  "Energy(kcal)": number | string;
  "Protein(g)": number | string;
  "Fat(g)": number | string;
  "Carbohydrate(g)": number | string;
  P_ratio: number | string;
  F_ratio: number | string;
  C_ratio: number | string;
  Tag: string;
  Cooking_Method: string;
  Notes: string;
};

type IngredientWithCalc = InputIngredientRow & {
  mappedFoodName: string;
  mappedFoodNo: string;
  group: keyof YieldTable;
  edibleWeight: number;
  finalWeight: number;
  contribution: Nutrients;
};

const ROOT = process.cwd();
const FOOD_MASTER_CANDIDATES = [
  path.resolve(ROOT, "food_source.xlsx"),
  path.resolve(ROOT, "source_japan2023.xlsx"),
];
const STEP3_APPROVED_XLSX = path.resolve(ROOT, "recipe_db_udon_100.xlsx");
const OUTPUT_XLSX = path.resolve(ROOT, "recipe_db_udon_100.xlsx");
const OUTPUT_REPORT = path.resolve(ROOT, "src/data/gohan120/udon_generation_report.json");
const YIELD_JSON = path.resolve(ROOT, "src/data/research/yield_master_udon100.json");
const RETENTION_JSON = path.resolve(ROOT, "src/data/research/retention_master_udon100.json");

const HEADER_ROW = 11;
const DATA_START_ROW = 12;
const TARGET_RECIPES = 100;
const MAX_TAG_RETRY = 3;
const LEAN_PROTEIN_NAME = "鶏むね肉(皮なし)";
const LEAN_PROTEIN_NOTE = "主菜たんぱく源 / ＜鳥肉類＞　にわとり　むね　皮なし　生";
const METHOD_TO_PROFILE: Record<string, keyof RetentionTable> = {
  "茹で": "boil",
  "茙で": "boil",
  "炒め": "stirFry",
  "煮る": "simmer",
  "煖る": "simmer",
  "焼き": "grill",
};

const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  "kcal",
  "protein",
  "fat",
  "carb",
  "calcium",
  "iron",
  "vitaminB1",
  "vitaminB2",
  "vitaminB6",
  "vitaminB12",
  "vitaminC",
  "vitaminD",
  "rae",
  "salt",
];

const norm = (v: string) =>
  v
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[・･()（）\[\]{}\-_,.]/g, "");

const toNumber = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || /^tr$/i.test(raw) || /^\(tr\)$/i.test(raw)) return 0;
  const n = Number(raw.replace(/,/g, "").replace(/[()]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function readJsonFile<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`必須ファイルがありません: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function findFoodMasterPath(): string {
  for (const candidate of FOOD_MASTER_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Food_Masterの参照元xlsxが見つかりません。");
}

function emptyNutrients(): Nutrients {
  return {
    kcal: 0,
    protein: 0,
    fat: 0,
    carb: 0,
    calcium: 0,
    iron: 0,
    vitaminB1: 0,
    vitaminB2: 0,
    vitaminB6: 0,
    vitaminB12: 0,
    vitaminC: 0,
    vitaminD: 0,
    rae: 0,
    salt: 0,
  };
}

function sumNutrients(items: Nutrients[]): Nutrients {
  const total = emptyNutrients();
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) total[key] += item[key];
  }
  return total;
}

function roundNutrients(n: Nutrients): Nutrients {
  const out = { ...n };
  for (const key of NUTRIENT_KEYS) out[key] = Number(out[key].toFixed(3));
  return out;
}

function readFoodMaster(xlsxPath: string): Food[] {
  const wb = XLSX.readFile(xlsxPath, { dense: true, cellText: true, cellDates: false });
  const ws = wb.Sheets["表全体"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws?.["!ref"]) throw new Error("Food_Masterシートが不正です。");

  const header = ws[HEADER_ROW] ?? [];
  const col = new Map<string, number>();
  for (let c = 0; c < header.length; c += 1) {
    const key = String(header[c]?.v ?? "").trim();
    if (key) col.set(key, c);
  }

  const getCol = (key: string) => {
    const idx = col.get(key);
    if (typeof idx !== "number") throw new Error(`Food_Master列が見つかりません: ${key}`);
    return idx;
  };

  const cFoodNo = 1;
  const cFoodName = 3;
  const cRefuse = getCol("REFUSE");
  const cKcal = getCol("ENERC_KCAL");
  const cProtein = getCol("PROT-");
  const cFat = getCol("FAT-");
  const cCarb = getCol("CHOCDF-");
  const cCalcium = getCol("CA");
  const cIron = getCol("FE");
  const cB1 = getCol("THIA");
  const cB2 = getCol("RIBF");
  const cB6 = getCol("VITB6A");
  const cB12 = getCol("VITB12");
  const cC = getCol("VITC");
  const cD = getCol("VITD");
  const cRAE = getCol("VITA_RAE");
  const cSalt = getCol("NACL_EQ");

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const foods: Food[] = [];
  for (let r = DATA_START_ROW; r <= range.e.r; r += 1) {
    const row = ws[r] ?? [];
    const foodNo = String(row[cFoodNo]?.v ?? "").trim().replace(/^0+/, "");
    const foodName = String(row[cFoodName]?.v ?? "").trim();
    if (!foodNo || !foodName) continue;

    foods.push({
      foodNo,
      foodName,
      refusePercent: toNumber(row[cRefuse]?.v),
      kcal: toNumber(row[cKcal]?.v),
      protein: toNumber(row[cProtein]?.v),
      fat: toNumber(row[cFat]?.v),
      carb: toNumber(row[cCarb]?.v),
      calcium: toNumber(row[cCalcium]?.v),
      iron: toNumber(row[cIron]?.v),
      vitaminB1: toNumber(row[cB1]?.v),
      vitaminB2: toNumber(row[cB2]?.v),
      vitaminB6: toNumber(row[cB6]?.v),
      vitaminB12: toNumber(row[cB12]?.v),
      vitaminC: toNumber(row[cC]?.v),
      vitaminD: toNumber(row[cD]?.v),
      rae: toNumber(row[cRAE]?.v),
      salt: toNumber(row[cSalt]?.v),
    });
  }
  return foods;
}

function readStep3Approved(filePath: string): {
  ingredients: InputIngredientRow[];
  steps: InputStepRow[];
  master: InputMasterRow[];
} {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STEP3 OKデータが見つかりません: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellText: true, cellDates: false });
  const ingredients = XLSX.utils.sheet_to_json(wb.Sheets["Ingredients"], { defval: "" }) as InputIngredientRow[];
  const steps = XLSX.utils.sheet_to_json(wb.Sheets["Steps"], { defval: "" }) as InputStepRow[];
  const master = XLSX.utils.sheet_to_json(wb.Sheets["Recipe_Master"], { defval: "" }) as InputMasterRow[];

  if (!ingredients.length || !steps.length || !master.length) {
    throw new Error("STEP3 OKデータのシート内容が不足しています。");
  }
  return { ingredients, steps, master };
}

function classifyGroup(ingredientName: string, notes: string): keyof YieldTable {
  const s = `${ingredientName} ${notes}`;
  if (/うどん|主食/i.test(s)) return "main";
  if (/牛|豚|鶏|魚|肉|たんぱく|ミンチ|ひき肉/i.test(s)) return "protein";
  if (/しょうゆ|みそ|みりん|清酒|塩|油|ごま油|砂糖|調味/i.test(s)) return "seasoning";
  return "vegetable";
}

function extractFoodHintFromNotes(notes: string): string {
  const parts = String(notes ?? "").split("/");
  if (parts.length < 2) return "";
  return parts.at(-1)?.trim() ?? "";
}

function findFoodByName(foods: Food[], query: string): Food | null {
  const nq = norm(query);
  if (!nq) return null;

  const exact = foods.find((f) => norm(f.foodName) === nq);
  if (exact) return exact;

  const includes = foods.filter((f) => norm(f.foodName).includes(nq) || nq.includes(norm(f.foodName)));
  if (includes.length === 1) return includes[0];
  return null;
}

function findFoodByIngredientName(foods: Food[], ingredientName: string): Food | null {
  const n = norm(ingredientName);
  const tokenMap: Array<{ test: (name: string) => boolean; tokens: string[] }> = [
    { test: (name) => /うどん/.test(name), tokens: ["うどん", "ゆで"] },
    { test: (name) => /たまねぎ/.test(name), tokens: ["たまねぎ", "生"] },
    { test: (name) => /にんじん/.test(name), tokens: ["にんじん", "皮なし", "生"] },
    { test: (name) => /キャベツ/.test(name), tokens: ["キャベツ", "生"] },
    { test: (name) => /ほうれんそう/.test(name), tokens: ["ほうれんそう", "生"] },
    { test: (name) => /だいこん/.test(name), tokens: ["だいこん", "皮なし", "生"] },
    { test: (name) => /ブロッコリー/.test(name), tokens: ["ブロッコリー", "生"] },
    { test: (name) => /しいたけ/.test(name), tokens: ["しいたけ", "生"] },
    { test: (name) => /ぶなしめじ/.test(name), tokens: ["ぶなしめじ", "生"] },
    { test: (name) => /しょうゆ/.test(name), tokens: ["こいくちしょうゆ"] },
    { test: (name) => /みそ/.test(name), tokens: ["米みそ"] },
    { test: (name) => /みりん/.test(name), tokens: ["本みりん"] },
    { test: (name) => /清酒/.test(name), tokens: ["清酒"] },
    { test: (name) => /^食塩$/.test(name), tokens: ["食塩"] },
    { test: (name) => /調合油/.test(name), tokens: ["調合油"] },
    { test: (name) => /ごま油/.test(name), tokens: ["ごま油"] },
    { test: (name) => /上白糖/.test(name), tokens: ["上白糖"] },
    { test: (name) => /牛/.test(name), tokens: ["うし", "生"] },
    { test: (name) => /豚/.test(name), tokens: ["ぶた", "生"] },
    { test: (name) => /鶏/.test(name), tokens: ["にわとり", "生"] },
    { test: (name) => /魚|まぐろ|さば|いわし|たら|まだい/.test(name), tokens: ["魚類", "生"] },
  ];

  const found = tokenMap.find((x) => x.test(n));
  if (!found) return null;
  const nt = found.tokens.map(norm);
  const matched = foods.find((f) => nt.every((t) => norm(f.foodName).includes(t)));
  return matched ?? null;
}

function scaleByYieldAndRetention(food: Food, rawWeight: number, group: keyof YieldTable, yieldTable: YieldTable, retention: Nutrients): {
  edibleWeight: number;
  finalWeight: number;
  contribution: Nutrients;
} {
  const edibleRatio = Math.max(0, Math.min(1, (100 - food.refusePercent) / 100));
  const edibleWeight = rawWeight * edibleRatio;
  const finalWeight = edibleWeight * yieldTable[group];

  const contribution = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    contribution[key] = (food[key] * finalWeight * retention[key]) / 100;
  }

  return { edibleWeight, finalWeight, contribution };
}

function createTags(n: Nutrients, digestible: boolean): string[] {
  const tags: string[] = [];
  if (n.protein >= 20) tags.push("高たんぱく");
  if (n.fat < 10) tags.push("低脂質");
  if (n.carb >= 70) tags.push("高炭水化物");
  if (n.fat < 10 && digestible) tags.push("試合前");
  if (n.protein >= 20 && n.carb >= 70) tags.push("試合後");
  if (n.kcal >= 700 || n.fat >= 25) tags.push("増量期");
  if (n.protein >= 20 && n.fat < 10) tags.push("減量期");
  return Array.from(new Set(tags));
}

function hasNA(value: unknown): boolean {
  return typeof value === "string" && /#N\/A/i.test(value);
}

function validateTables(yieldTable: YieldTable, retentionTable: RetentionTable): void {
  const yieldKeys: (keyof YieldTable)[] = ["main", "protein", "vegetable", "seasoning"];
  for (const key of yieldKeys) {
    if (!Number.isFinite(yieldTable[key]) || yieldTable[key] <= 0) {
      throw new Error(`Yieldテーブル異常: ${key}`);
    }
  }

  const retentionKeys: (keyof RetentionTable)[] = ["boil", "stirFry", "simmer", "grill"];
  for (const profile of retentionKeys) {
    const row = retentionTable[profile];
    if (!row) throw new Error(`Retentionテーブル異常: ${profile}`);
    for (const nKey of NUTRIENT_KEYS) {
      if (!Number.isFinite(row[nKey]) || row[nKey] <= 0) {
        throw new Error(`Retentionテーブル異常: ${profile}.${nKey}`);
      }
    }
  }
}

function cloneIngredientRows(rows: InputIngredientRow[]): InputIngredientRow[] {
  return rows.map((row) => ({ ...row }));
}

function cloneStepRows(rows: InputStepRow[]): InputStepRow[] {
  return rows.map((row) => ({ ...row }));
}

function parseTagList(tag: string): string[] {
  return String(tag ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function tagsSatisfyCondition(targetTags: string[], actualTags: string[]): boolean {
  if (!targetTags.length) return actualTags.length > 0;
  return targetTags.every((tag) => actualTags.includes(tag));
}

function recipeSignature(name: string): string {
  return String(name ?? "")
    .replace(/[0-9０-９]/g, "")
    .replace(/うどん/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function calculateRecipe(
  recipe: InputMasterRow,
  ingredientRows: InputIngredientRow[],
  foods: Food[],
  yieldTable: YieldTable,
  retentionTable: RetentionTable
): {
  ingredients: IngredientWithCalc[];
  total: Nutrients;
  pRatio: number;
  fRatio: number;
  cRatio: number;
  tags: string[];
} {
  const method = METHOD_TO_PROFILE[String(recipe.Cooking_Method)] ?? null;
  if (!method) {
    throw new Error(`Cooking_Methodの定義がありません: ${recipe.Recipe_ID} ${recipe.Cooking_Method}`);
  }

  const calcIngredients: IngredientWithCalc[] = [];
  for (const row of ingredientRows) {
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row["Weight(g)"]) || hasNA(row.Notes)) {
      throw new Error(`Ingredientsに#N/Aが存在します: ${recipe.Recipe_ID}`);
    }
    const rawWeight = toNumber(row["Weight(g)"]);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      throw new Error(`原材料重量が不正です: ${recipe.Recipe_ID} ${row.Ingredient_Name}`);
    }

    const hint = extractFoodHintFromNotes(String(row.Notes));
    const matched =
      findFoodByName(foods, hint) ?? findFoodByName(foods, String(row.Ingredient_Name)) ?? findFoodByIngredientName(foods, String(row.Ingredient_Name));
    if (!matched) {
      throw new Error(`Food_Master参照失敗: ${recipe.Recipe_ID} ${row.Ingredient_Name} (hint=${hint || "none"})`);
    }

    const group = classifyGroup(String(row.Ingredient_Name), String(row.Notes));
    const calc = scaleByYieldAndRetention(matched, rawWeight, group, yieldTable, retentionTable[method]);
    calcIngredients.push({
      ...row,
      mappedFoodName: matched.foodName,
      mappedFoodNo: matched.foodNo,
      group,
      edibleWeight: calc.edibleWeight,
      finalWeight: calc.finalWeight,
      contribution: calc.contribution,
    });
  }

  const total = roundNutrients(sumNutrients(calcIngredients.map((x) => x.contribution)));
  const pEnergy = total.protein * 4;
  const fEnergy = total.fat * 9;
  const cEnergy = total.carb * 4;
  const totalEnergy = Math.max(1, pEnergy + fEnergy + cEnergy);
  const pRatio = Number(((pEnergy / totalEnergy) * 100).toFixed(1));
  const fRatio = Number(((fEnergy / totalEnergy) * 100).toFixed(1));
  const cRatio = Number(((cEnergy / totalEnergy) * 100).toFixed(1));
  const digestible = ["boil", "simmer"].includes(METHOD_TO_PROFILE[String(recipe.Cooking_Method)] ?? "");
  const tags = createTags(total, digestible);
  return { ingredients: calcIngredients, total, pRatio, fRatio, cRatio, tags };
}

function scaleWeight(row: InputIngredientRow, ratio: number, minWeight = 0.2): void {
  const next = Math.max(minWeight, toNumber(row["Weight(g)"]) * ratio);
  row["Weight(g)"] = Number(next.toFixed(1));
}

function adjustIngredientsForRetry(
  rows: InputIngredientRow[],
  targetTags: string[],
  attempt: number
): InputIngredientRow[] {
  const adjusted = cloneIngredientRows(rows);
  const needsHighProtein = !targetTags.length || targetTags.some((tag) => ["高たんぱく", "試合後", "減量期"].includes(tag));
  const needsLowFat = targetTags.some((tag) => ["低脂質", "試合前", "減量期"].includes(tag));
  const needsHighCarb = targetTags.some((tag) => ["高炭水化物", "試合後"].includes(tag));
  const needsBulk = targetTags.some((tag) => tag === "増量期");

  const proteinRows = adjusted.filter((row) => classifyGroup(String(row.Ingredient_Name), String(row.Notes)) === "protein");
  const mainRows = adjusted.filter((row) => classifyGroup(String(row.Ingredient_Name), String(row.Notes)) === "main");
  const oilRows = adjusted.filter((row) => /調合油|ごま油|油/i.test(String(row.Ingredient_Name)));

  const proteinScale = [1.2, 1.35, 1.5][attempt - 1] ?? 1.5;
  const carbScale = [1.08, 1.16, 1.24][attempt - 1] ?? 1.24;
  const oilReduceScale = [0.8, 0.6, 0.45][attempt - 1] ?? 0.45;
  const bulkScale = [1.12, 1.24, 1.36][attempt - 1] ?? 1.36;

  if (needsHighProtein && proteinRows.length) {
    for (const row of proteinRows) scaleWeight(row, proteinScale);
  }
  if (needsHighCarb && mainRows.length) {
    for (const row of mainRows) scaleWeight(row, carbScale, 20);
  }
  if (needsBulk) {
    for (const row of [...proteinRows, ...mainRows]) scaleWeight(row, bulkScale, 20);
  }
  if (needsLowFat && oilRows.length) {
    for (const row of oilRows) scaleWeight(row, oilReduceScale);
  }

  if ((needsLowFat || needsHighProtein || !targetTags.length) && attempt >= 2 && proteinRows.length) {
    const target = proteinRows[0];
    target.Ingredient_Name = LEAN_PROTEIN_NAME;
    target.Notes = LEAN_PROTEIN_NOTE;
    if (attempt >= 3) scaleWeight(target, 1.25);
  }

  return adjusted;
}

function chooseReplacementRecipeId(
  original: InputMasterRow,
  allMaster: InputMasterRow[],
  baselineByRecipeId: Map<string, { tags: string[] }>,
  targetTags: string[]
): string {
  const originalSig = recipeSignature(String(original.Recipe_Name));
  const candidates = allMaster
    .filter((row) => String(row.Recipe_ID) !== String(original.Recipe_ID))
    .filter((row) => {
      const base = baselineByRecipeId.get(String(row.Recipe_ID));
      return base ? tagsSatisfyCondition(targetTags, base.tags) : false;
    });

  if (!candidates.length) {
    throw new Error(`差し替え候補が見つかりません: ${original.Recipe_ID}`);
  }

  const different = candidates.find(
    (row) => recipeSignature(String(row.Recipe_Name)) !== originalSig && String(row.Cooking_Method) !== String(original.Cooking_Method)
  );
  return String((different ?? candidates[0]).Recipe_ID);
}

function main(): void {
  const foodMasterPath = findFoodMasterPath();
  const foods = readFoodMaster(foodMasterPath);
  const step3 = readStep3Approved(STEP3_APPROVED_XLSX);
  const yieldTable = readJsonFile<YieldTable>(YIELD_JSON);
  const retentionTable = readJsonFile<RetentionTable>(RETENTION_JSON);
  validateTables(yieldTable, retentionTable);

  if (step3.master.length !== TARGET_RECIPES) {
    throw new Error(`100品条件違反: Recipe_Master=${step3.master.length}`);
  }

  const masterByRecipe = new Map(step3.master.map((r) => [String(r.Recipe_ID), r] as const));
  const inputIngredientRowsByRecipe = new Map<string, InputIngredientRow[]>();
  const inputStepRowsByRecipe = new Map<string, InputStepRow[]>();

  // 入力整合チェック
  for (const row of step3.ingredients) {
    const recipeId = String(row.Recipe_ID);
    const recipe = masterByRecipe.get(recipeId);
    if (!recipe) throw new Error(`IngredientsのRecipe_IDがRecipe_Masterに存在しません: ${recipeId}`);
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row["Weight(g)"]) || hasNA(row.Notes)) {
      throw new Error(`Ingredientsに#N/Aが存在します: ${recipeId}`);
    }
    const rawWeight = toNumber(row["Weight(g)"]);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      throw new Error(`原材料重量が不正です: ${recipeId} ${row.Ingredient_Name}`);
    }
    const list = inputIngredientRowsByRecipe.get(recipeId) ?? [];
    list.push({ ...row });
    inputIngredientRowsByRecipe.set(recipeId, list);
  }
  for (const row of step3.steps) {
    if (Object.values(row).some((v) => hasNA(v))) {
      throw new Error(`Stepsに#N/Aが存在します: ${row.Recipe_ID}`);
    }
    const recipeId = String(row.Recipe_ID);
    const recipe = masterByRecipe.get(recipeId);
    if (!recipe) throw new Error(`StepsのRecipe_IDがRecipe_Masterに存在しません: ${recipeId}`);
    const list = inputStepRowsByRecipe.get(recipeId) ?? [];
    list.push({ ...row });
    inputStepRowsByRecipe.set(recipeId, list);
  }

  // 差し替え候補選択のため、入力状態のタグ判定を全レシピ分計算
  const baselineByRecipeId = new Map<string, { tags: string[] }>();
  for (const row of step3.master) {
    const recipeId = String(row.Recipe_ID);
    const ingredients = inputIngredientRowsByRecipe.get(recipeId) ?? [];
    if (!ingredients.length) throw new Error(`レシピにIngredientsがありません: ${recipeId}`);
    const calc = calculateRecipe(row, ingredients, foods, yieldTable, retentionTable);
    baselineByRecipeId.set(recipeId, { tags: calc.tags });
  }

  // Step1-7 + タグ未達再試行 + 差し替え
  const outputMaster: InputMasterRow[] = [];
  const outputIngredients: InputIngredientRow[] = [];
  const outputSteps: InputStepRow[] = [];
  const finalCalcByRecipe = new Map<string, { ingredients: IngredientWithCalc[]; total: Nutrients }>();
  let matchedTagCount = 0;
  let retryAdjustedRecipeCount = 0;
  let replacedRecipeCount = 0;

  for (const original of step3.master) {
    const recipeId = String(original.Recipe_ID);
    const prevTag = String(original.Tag ?? "").trim();
    const targetTags = parseTagList(prevTag);

    const baseIngredients = inputIngredientRowsByRecipe.get(recipeId) ?? [];
    const baseSteps = inputStepRowsByRecipe.get(recipeId) ?? [];
    if (!baseIngredients.length) throw new Error(`レシピにIngredientsがありません: ${recipeId}`);
    if (!baseSteps.length) throw new Error(`レシピにStepsがありません: ${recipeId}`);

    let appliedRecipe = { ...original };
    let appliedIngredients = cloneIngredientRows(baseIngredients);
    let appliedSteps = cloneStepRows(baseSteps);
    let calc = calculateRecipe(appliedRecipe, appliedIngredients, foods, yieldTable, retentionTable);
    let satisfied = tagsSatisfyCondition(targetTags, calc.tags);
    let retrySuccess = false;
    let usedReplacement = false;

    if (!satisfied) {
      for (let attempt = 1; attempt <= MAX_TAG_RETRY; attempt += 1) {
        const retryIngredients = adjustIngredientsForRetry(appliedIngredients, targetTags, attempt).map((row) => ({
          ...row,
          Recipe_ID: recipeId,
        }));
        const retryCalc = calculateRecipe(appliedRecipe, retryIngredients, foods, yieldTable, retentionTable);
        if (tagsSatisfyCondition(targetTags, retryCalc.tags)) {
          appliedIngredients = retryIngredients;
          calc = retryCalc;
          satisfied = true;
          retrySuccess = true;
          break;
        }
        appliedIngredients = retryIngredients;
      }
    }

    if (!satisfied) {
      const replacementId = chooseReplacementRecipeId(original, step3.master, baselineByRecipeId, targetTags);
      const replacementMaster = masterByRecipe.get(replacementId);
      const replacementIngredients = inputIngredientRowsByRecipe.get(replacementId);
      const replacementSteps = inputStepRowsByRecipe.get(replacementId);
      if (!replacementMaster || !replacementIngredients || !replacementSteps) {
        throw new Error(`差し替え元の参照に失敗しました: from=${replacementId} to=${recipeId}`);
      }

      appliedRecipe = {
        ...original,
        Recipe_Name: String(replacementMaster.Recipe_Name),
        Cooking_Method: String(replacementMaster.Cooking_Method),
      };
      appliedIngredients = cloneIngredientRows(replacementIngredients).map((row) => ({ ...row, Recipe_ID: recipeId }));
      appliedSteps = cloneStepRows(replacementSteps).map((row) => ({ ...row, Recipe_ID: recipeId }));
      calc = calculateRecipe(appliedRecipe, appliedIngredients, foods, yieldTable, retentionTable);
      satisfied = tagsSatisfyCondition(targetTags, calc.tags);
      if (!satisfied) {
        throw new Error(`差し替え後もタグ条件未達です: ${recipeId} <- ${replacementId}`);
      }
      usedReplacement = true;
      replacedRecipeCount += 1;
    }

    if (retrySuccess) retryAdjustedRecipeCount += 1;
    const nextTag = calc.tags.join(", ");
    if (prevTag && prevTag === nextTag) matchedTagCount += 1;

    outputIngredients.push(...appliedIngredients);
    outputSteps.push(...appliedSteps);
    finalCalcByRecipe.set(recipeId, { ingredients: calc.ingredients, total: calc.total });

    const notesSuffix = usedReplacement
      ? "; resolved_by=replacement"
      : retrySuccess
      ? "; resolved_by=retry_adjustment"
      : "";

    outputMaster.push({
      Recipe_ID: recipeId,
      Recipe_Name: String(appliedRecipe.Recipe_Name),
      "Energy(kcal)": calc.total.kcal,
      "Protein(g)": calc.total.protein,
      "Fat(g)": calc.total.fat,
      "Carbohydrate(g)": calc.total.carb,
      P_ratio: calc.pRatio,
      F_ratio: calc.fRatio,
      C_ratio: calc.cRatio,
      Tag: nextTag,
      Cooking_Method: String(appliedRecipe.Cooking_Method),
      Notes: `Food_Master=${path.basename(foodMasterPath)}; Step1-7 completed; ingredients=${appliedIngredients.length}${notesSuffix}`,
    });
  }

  if (outputIngredients.length !== step3.ingredients.length) {
    throw new Error(`Ingredients行数不整合: input=${step3.ingredients.length} output=${outputIngredients.length}`);
  }
  if (outputSteps.length !== step3.steps.length) {
    throw new Error(`Steps行数不整合: input=${step3.steps.length} output=${outputSteps.length}`);
  }

  // 検証
  if (outputMaster.length !== TARGET_RECIPES) {
    throw new Error(`100品条件違反: 出力Recipe_Master=${outputMaster.length}`);
  }

  for (const row of outputMaster) {
    if (Object.values(row).some((v) => hasNA(v))) {
      throw new Error(`Recipe_Masterに#N/Aが存在します: ${row.Recipe_ID}`);
    }

    const nums = [
      toNumber(row["Energy(kcal)"]),
      toNumber(row["Protein(g)"]),
      toNumber(row["Fat(g)"]),
      toNumber(row["Carbohydrate(g)"]),
      toNumber(row.P_ratio),
      toNumber(row.F_ratio),
      toNumber(row.C_ratio),
    ];
    if (nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`栄養欠損(非数)があります: ${row.Recipe_ID}`);
    }

    const p = toNumber(row.P_ratio);
    const f = toNumber(row.F_ratio);
    const c = toNumber(row.C_ratio);
    const pfcSum = Number((p + f + c).toFixed(1));
    if (Math.abs(pfcSum - 100) > 0.2) {
      throw new Error(`PFC整合エラー: ${row.Recipe_ID} sum=${pfcSum}`);
    }

    const finalCalc = finalCalcByRecipe.get(String(row.Recipe_ID));
    if (!finalCalc) throw new Error(`計算キャッシュが見つかりません: ${row.Recipe_ID}`);
    const summed = roundNutrients(sumNutrients(finalCalc.ingredients.map((x) => x.contribution)));
    if (
      Math.abs(summed.kcal - toNumber(row["Energy(kcal)"])) > 0.001 ||
      Math.abs(summed.protein - toNumber(row["Protein(g)"])) > 0.001 ||
      Math.abs(summed.fat - toNumber(row["Fat(g)"])) > 0.001 ||
      Math.abs(summed.carb - toNumber(row["Carbohydrate(g)"])) > 0.001
    ) {
      throw new Error(`栄養完全一致エラー: ${row.Recipe_ID}`);
    }
  }

  for (const row of step3.ingredients) {
    if (Object.values(row).some((v) => hasNA(v))) {
      throw new Error(`Ingredientsに#N/Aが存在します: ${row.Recipe_ID}`);
    }
  }
  for (const row of step3.steps) {
    if (Object.values(row).some((v) => hasNA(v))) {
      throw new Error(`Stepsに#N/Aが存在します: ${row.Recipe_ID}`);
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outputIngredients), "Ingredients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outputSteps), "Steps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outputMaster), "Recipe_Master");
  XLSX.writeFile(wb, OUTPUT_XLSX);

  // Excel再読込で正常性確認
  const verifyWb = XLSX.readFile(OUTPUT_XLSX, { cellText: true, cellDates: false });
  const sheetNames = verifyWb.SheetNames;
  if (sheetNames.length !== 3 || !sheetNames.includes("Ingredients") || !sheetNames.includes("Steps") || !sheetNames.includes("Recipe_Master")) {
    throw new Error(`Excel出力異常: シート構成が不正です (${sheetNames.join(",")})`);
  }

  const report = {
    status: "success",
    source_food_master: foodMasterPath,
    source_step3: STEP3_APPROVED_XLSX,
    output: OUTPUT_XLSX,
    recipe_count: outputMaster.length,
    ingredient_rows: outputIngredients.length,
    step_rows: outputSteps.length,
    tag_matched_with_input_count: matchedTagCount,
    tag_retry_adjusted_recipe_count: retryAdjustedRecipeCount,
    tag_replaced_recipe_count: replacedRecipeCount,
    checks: {
      na_zero: true,
      nutrition_missing_zero: true,
      pfc_consistency: true,
      tag_consistency: true,
      excel_valid: true,
      nutrition_exact_match: true,
    },
    process: [
      "Step1 マスタ参照: OK",
      "Step2 可食部補正: OK",
      "Step3 Yield補正: OK",
      "Step4 Retention補正: OK",
      "Step5 合算: OK",
      "Step6 PFC算出: OK",
      "Step7 タグ付与: OK",
    ],
  };

  fs.mkdirSync(path.dirname(OUTPUT_REPORT), { recursive: true });
  fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const failed = {
    status: "failed",
    reason,
    stopped_at: new Date().toISOString(),
  };
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
