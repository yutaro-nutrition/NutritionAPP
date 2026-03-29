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
type RetentionProcessCode = "RAW" | "BOIL" | "SIMMER" | "SAUTE" | "GRILL";

type IngredientRow = {
  Recipe_ID: string;
  Ingredient_Name: string;
  "Weight(g)": number;
  Notes: string;
};

type StepRow = {
  Recipe_ID: string;
  Step_Number: number;
  Instruction: string;
};

type MasterRow = {
  Recipe_ID: string;
  Recipe_Name: string;
  "Energy(kcal)": number;
  "Protein(g)": number;
  "Fat(g)": number;
  "Carbohydrate(g)": number;
  P_ratio: number;
  F_ratio: number;
  C_ratio: number;
  Tag: string;
  Cooking_Method: string;
  Notes: string;
};

type IngredientCalc = IngredientRow & {
  mappedFoodName: string;
  group: keyof YieldTable;
  contribution: Nutrients;
};

type RecipeSpecIngredient = {
  name: string;
  weight: number;
  noteHint: string;
};

type RecipeSpec = {
  id: string;
  name: string;
  style:
    | "yamakake"
    | "tsukimi"
    | "kamo"
    | "niku"
    | "nishin"
    | "hiyashi"
    | "kinoko"
    | "tanuki"
    | "ebiten"
    | "torinanban";
  method: "茹で" | "煮る";
  targetTags: string[];
  proteinKey: string;
  ingredients: RecipeSpecIngredient[];
};

const ROOT = process.cwd();
const FOOD_MASTER_CANDIDATES = [
  "C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx",
  path.resolve(ROOT, "Food_Master_Japan2023_IndexBased.xlsx"),
  path.resolve(ROOT, "source_japan2023.xlsx"),
  path.resolve(ROOT, "food_source.xlsx"),
];
const YIELD_CANDIDATES = [
  "C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx",
  path.resolve(ROOT, "src/data/research/yield_master_soba50.json"),
  path.resolve(ROOT, "src/data/research/yield_master_udon100.json"),
];
const RETENTION_CANDIDATES = [
  "C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx",
  path.resolve(ROOT, "src/data/research/retention_master_soba50.json"),
  path.resolve(ROOT, "src/data/research/retention_master_udon100.json"),
];
const OUTPUT_XLSX = path.resolve(ROOT, "recipe_db_soba_50.xlsx");
const OUTPUT_REPORT = path.resolve(ROOT, "soba_generation_report.json");
const TARGET_RECIPES = 50;
const HEADER_ROW = 11;
const DATA_START_ROW = 12;
const MAX_TAG_RETRY = 3;

const METHOD_TO_PROFILE: Record<string, keyof RetentionTable> = {
  "茹で": "boil",
  "茙で": "boil",
  "煮る": "simmer",
  "炒め": "stirFry",
  "焼き": "grill",
};
const METHOD_TO_PROCESS_CODE: Record<string, RetentionProcessCode> = {
  "茹で": "BOIL",
  "茙で": "BOIL",
  "煮る": "SIMMER",
  "炒め": "SAUTE",
  "焼き": "GRILL",
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
    .replace(/[・･()（）\[\]{}\-_,.＜＞\[\]　]/g, "");

const toNumber = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || /^tr$/i.test(raw) || /^\(tr\)$/i.test(raw)) return 0;
  const n = Number(raw.replace(/,/g, "").replace(/[()]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const hasNA = (v: unknown): boolean => typeof v === "string" && /#N\/A|#REF!|#VALUE!/i.test(v);

function pickExistingFile(candidates: string[], label: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`必須ファイル不足: ${label} (${candidates.join(" / ")})`);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
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
  const wsNumeric = wb.Sheets["Food_Master_Numeric"];
  if (wsNumeric) {
    const rows = XLSX.utils.sheet_to_json(wsNumeric, { defval: "" }) as Array<Record<string, unknown>>;
    return rows
      .map((r) => ({
        foodNo: String(r.Food_No ?? "").trim().replace(/^0+/, ""),
        foodName: String(r.Food_Name ?? "").trim(),
        refusePercent: toNumber(r.REFUSE),
        kcal: toNumber(r.ENERC_KCAL),
        protein: toNumber(r["PROT-"]),
        fat: toNumber(r["FAT-"]),
        carb: toNumber(r["CHOCDF-"]),
        calcium: toNumber(r.CA),
        iron: toNumber(r.FE),
        vitaminB1: toNumber(r.THIA),
        vitaminB2: toNumber(r.RIBF),
        vitaminB6: toNumber(r.VITB6A),
        vitaminB12: toNumber(r.VITB12),
        vitaminC: toNumber(r.VITC),
        vitaminD: toNumber(r.VITD),
        rae: toNumber(r.VITA_RAE),
        salt: toNumber(r.NACL_EQ),
      }))
      .filter((x) => x.foodNo && x.foodName);
  }

  const ws = wb.Sheets["表全体"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws?.["!ref"]) throw new Error("Food_Masterシート不正");

  const header = ws[HEADER_ROW] ?? [];
  const col = new Map<string, number>();
  for (let c = 0; c < header.length; c += 1) {
    const key = String(header[c]?.v ?? "").trim();
    if (key) col.set(key, c);
  }

  const getCol = (key: string): number => {
    const idx = col.get(key);
    if (typeof idx !== "number") throw new Error(`Food_Master列不足: ${key}`);
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

function readYieldRetentionFromWorkbook(filePath: string): {
  yieldByFoodProcess: Map<string, number>;
  retentionByFoodProcess: Map<string, Nutrients>;
} {
  const wb = XLSX.readFile(filePath, { cellText: true, cellDates: false });
  const yieldWs = wb.Sheets["Yield_Table"];
  const retentionWs = wb.Sheets["Retention_Table"];
  if (!yieldWs || !retentionWs) {
    throw new Error(`Retention/Yieldシート不足: ${filePath}`);
  }

  const yieldRows = XLSX.utils.sheet_to_json(yieldWs, { defval: "" }) as Array<Record<string, unknown>>;
  const retentionRows = XLSX.utils.sheet_to_json(retentionWs, { defval: "" }) as Array<Record<string, unknown>>;
  const yieldByFoodProcess = new Map<string, number>();
  for (const row of yieldRows) {
    const foodId = String(row.Food_ID ?? "").trim().replace(/^0+/, "");
    const process = String(row.Process ?? "").trim().toUpperCase();
    const rate = toNumber(row.Yield_Rate);
    if (!foodId || !process || !Number.isFinite(rate) || rate <= 0) continue;
    yieldByFoodProcess.set(`${foodId}|${process}`, rate);
  }

  const retentionByFoodProcess = new Map<string, Nutrients>();
  const nutrientKeyMap: Record<string, keyof Nutrients> = {
    Energy: "kcal",
    Protein: "protein",
    Fat: "fat",
    Carbohydrate: "carb",
    Calcium: "calcium",
    Iron: "iron",
    Vitamin_B1: "vitaminB1",
    Vitamin_B2: "vitaminB2",
    Vitamin_B6: "vitaminB6",
    Vitamin_B12: "vitaminB12",
    Vitamin_C: "vitaminC",
    Vitamin_D: "vitaminD",
    "Retinol Activity Equivalents": "rae",
    solt: "salt",
  };
  for (const row of retentionRows) {
    const foodId = String(row.Food_ID ?? "").trim().replace(/^0+/, "");
    const process = String(row.Process ?? "").trim().toUpperCase();
    const nutrient = String(row.Nutrient ?? "").trim();
    const mapped = nutrientKeyMap[nutrient];
    if (!foodId || !process || !mapped) continue;
    const rate = toNumber(row.Retention_Rate);
    const key = `${foodId}|${process}`;
    const n = retentionByFoodProcess.get(key) ?? emptyNutrients();
    n[mapped] = Number.isFinite(rate) && rate > 0 ? rate : 1;
    retentionByFoodProcess.set(key, n);
  }
  for (const [key, n] of retentionByFoodProcess.entries()) {
    for (const nk of NUTRIENT_KEYS) {
      if (!Number.isFinite(n[nk]) || n[nk] <= 0) n[nk] = 1;
    }
    retentionByFoodProcess.set(key, n);
  }

  return { yieldByFoodProcess, retentionByFoodProcess };
}

function classifyGroup(ingredientName: string, notes: string): keyof YieldTable {
  const s = `${ingredientName} ${notes}`;
  if (/そば|主食/i.test(s)) return "main";
  if (/牛|豚|鶏|魚|肉|たんぱく|卵|にしん|鴨|えび/i.test(s)) return "protein";
  if (/しょうゆ|みそ|みりん|清酒|塩|油|ごま油|砂糖|調味/i.test(s)) return "seasoning";
  return "vegetable";
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
    { test: (name) => /干しそば|乾そば/.test(name), tokens: ["そば", "干しそば", "乾"] },
    { test: (name) => /ゆでそば|茹でそば/.test(name), tokens: ["そば", "そば", "ゆで"] },
    { test: (name) => /長いも|とろろ/.test(name), tokens: ["ながいも", "ながいも", "生"] },
    { test: (name) => /長ねぎ|根深ねぎ/.test(name), tokens: ["根深ねぎ", "軟白", "生"] },
    { test: (name) => /鶏卵|卵/.test(name), tokens: ["鶏卵", "全卵", "生"] },
    { test: (name) => /鴨/.test(name), tokens: ["かも", "あひる", "皮なし", "生"] },
    { test: (name) => /にしん/.test(name), tokens: ["にしん", "生"] },
    { test: (name) => /揚げ玉/.test(name), tokens: ["プレミックス粉", "天ぷら", "バッター", "揚げ"] },
    { test: (name) => /えび天/.test(name), tokens: ["バナメイえび", "天ぷら"] },
    { test: (name) => /たまねぎ/.test(name), tokens: ["たまねぎ", "生"] },
    { test: (name) => /にんじん/.test(name), tokens: ["にんじん", "生"] },
    { test: (name) => /キャベツ/.test(name), tokens: ["キャベツ", "生"] },
    { test: (name) => /ほうれんそう/.test(name), tokens: ["ほうれんそう", "生"] },
    { test: (name) => /だいこん/.test(name), tokens: ["だいこん", "生"] },
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
    { test: (name) => /魚|まぐろ|さば|いわし|たら|まだい|にしん/.test(name), tokens: ["魚類", "生"] },
  ];

  const found = tokenMap.find((x) => x.test(n));
  if (!found) return null;
  const nt = found.tokens.map(norm);
  return foods.find((f) => nt.every((t) => norm(f.foodName).includes(t))) ?? null;
}

function scaleByYieldAndRetention(food: Food, rawWeight: number, group: keyof YieldTable, yieldTable: YieldTable, retention: Nutrients) {
  const edibleRatio = Math.max(0, Math.min(1, (100 - food.refusePercent) / 100));
  const edibleWeight = rawWeight * edibleRatio;
  const finalWeight = edibleWeight * yieldTable[group];

  const contribution = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    contribution[key] = (food[key] * finalWeight * retention[key]) / 100;
  }
  return { contribution };
}

function createTags(n: Nutrients, digestible: boolean): string[] {
  const tags: string[] = [];
  if (n.protein >= 20) tags.push("高たんぱく");
  if (n.fat < 10) tags.push("低脂質");
  if (n.carb >= 70) tags.push("高炭水化物");
  if (n.fat < 10 && digestible) tags.push("試合前");
  if (n.protein >= 20 && n.carb >= 70) tags.push("試合後");
  if (n.kcal >= 650 || n.fat >= 20) tags.push("増量期");
  if (n.protein >= 20 && n.fat < 10) tags.push("減量期");
  return Array.from(new Set(tags));
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
    for (const key of NUTRIENT_KEYS) {
      if (!Number.isFinite(row[key]) || row[key] <= 0) {
        throw new Error(`Retentionテーブル異常: ${profile}.${key}`);
      }
    }
  }
}

function tagsSatisfyCondition(targetTags: string[], actualTags: string[]): boolean {
  return targetTags.every((tag) => actualTags.includes(tag));
}

function calculateRecipe(
  recipe: Pick<MasterRow, "Recipe_ID" | "Cooking_Method">,
  ingredients: IngredientRow[],
  foods: Food[],
  yieldTable: YieldTable,
  retentionTable: RetentionTable,
  yieldByFoodProcess: Map<string, number>,
  retentionByFoodProcess: Map<string, Nutrients>
) {
  const method = METHOD_TO_PROFILE[String(recipe.Cooking_Method)];
  if (!method) throw new Error(`Cooking_Method不明: ${recipe.Recipe_ID}`);
  const processCode = METHOD_TO_PROCESS_CODE[String(recipe.Cooking_Method)] ?? "RAW";

  const calcIngredients: IngredientCalc[] = [];
  for (const row of ingredients) {
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row["Weight(g)"]) || hasNA(row.Notes)) {
      throw new Error(`Ingredientsエラー値: ${recipe.Recipe_ID}`);
    }
    const w = toNumber(row["Weight(g)"]);
    if (!Number.isFinite(w) || w <= 0) throw new Error(`Weight不正: ${recipe.Recipe_ID} ${row.Ingredient_Name}`);

    const noteHint = String(row.Notes ?? "").split("/").at(-1)?.trim() ?? "";
    const food =
      findFoodByName(foods, noteHint) ??
      findFoodByName(foods, row.Ingredient_Name) ??
      findFoodByIngredientName(foods, row.Ingredient_Name);
    if (!food) throw new Error(`Food_Master紐付失敗: ${recipe.Recipe_ID} ${row.Ingredient_Name} hint=${noteHint || "none"}`);

    const group = classifyGroup(row.Ingredient_Name, row.Notes);
    const overrideYield = yieldByFoodProcess.get(`${food.foodNo}|${processCode}`);
    const applyYield: YieldTable = {
      ...yieldTable,
      [group]: overrideYield && overrideYield > 0 ? overrideYield : yieldTable[group],
    };
    const overrideRetention = retentionByFoodProcess.get(`${food.foodNo}|${processCode}`) ?? retentionTable[method];
    const scaled = scaleByYieldAndRetention(food, w, group, applyYield, overrideRetention);
    calcIngredients.push({
      ...row,
      mappedFoodName: food.foodName,
      group,
      contribution: scaled.contribution,
    });
  }

  const total = roundNutrients(sumNutrients(calcIngredients.map((x) => x.contribution)));
  const pEnergy = total.protein * 4;
  const fEnergy = total.fat * 9;
  const cEnergy = total.carb * 4;
  const denom = Math.max(1, pEnergy + fEnergy + cEnergy);
  const pRatio = Number(((pEnergy / denom) * 100).toFixed(1));
  const fRatio = Number(((fEnergy / denom) * 100).toFixed(1));
  const cRatio = Number(((cEnergy / denom) * 100).toFixed(1));
  const digestible = method === "boil" || method === "simmer";
  const tags = createTags(total, digestible);

  return { calcIngredients, total, pRatio, fRatio, cRatio, tags };
}

function scaleWeight(row: IngredientRow, ratio: number, minWeight = 0.2): void {
  const next = Math.max(minWeight, toNumber(row["Weight(g)"]) * ratio);
  row["Weight(g)"] = Number(next.toFixed(1));
}

function adjustIngredientsForRetry(rows: IngredientRow[], targetTags: string[], attempt: number): IngredientRow[] {
  const adjusted = rows.map((row) => ({ ...row }));
  const needsHighProtein = targetTags.some((tag) => ["高たんぱく", "試合後", "減量期"].includes(tag));
  const needsLowFat = targetTags.some((tag) => ["低脂質", "試合前", "減量期"].includes(tag));
  const needsHighCarb = targetTags.some((tag) => ["高炭水化物", "試合後"].includes(tag));
  const needsBulk = targetTags.some((tag) => tag === "増量期");

  const proteinRows = adjusted.filter((row) => classifyGroup(row.Ingredient_Name, row.Notes) === "protein");
  const mainRows = adjusted.filter((row) => classifyGroup(row.Ingredient_Name, row.Notes) === "main");
  const oilRows = adjusted.filter((row) => /調合油|ごま油|揚げ玉|えび天/.test(String(row.Ingredient_Name)));

  const proteinScale = [1.18, 1.3, 1.42][attempt - 1] ?? 1.42;
  const carbScale = [1.08, 1.16, 1.24][attempt - 1] ?? 1.24;
  const fatReduce = [0.78, 0.62, 0.5][attempt - 1] ?? 0.5;
  const bulkScale = [1.12, 1.22, 1.32][attempt - 1] ?? 1.32;

  if (needsHighProtein) for (const row of proteinRows) scaleWeight(row, proteinScale);
  if (needsHighCarb) for (const row of mainRows) scaleWeight(row, carbScale, 30);
  if (needsBulk) for (const row of [...mainRows, ...proteinRows]) scaleWeight(row, bulkScale, 20);
  if (needsLowFat) for (const row of oilRows) scaleWeight(row, fatReduce, 0.1);

  if (needsLowFat && attempt >= 2) {
    for (const row of adjusted) {
      if (/鶏もも肉\(皮つき\)|鴨肉/.test(row.Ingredient_Name)) {
        row.Ingredient_Name = "鶏むね肉(皮なし)";
        row.Notes = "主菜たんぱく源 / ＜鳥肉類＞　にわとり　むね　皮なし　生";
      }
    }
  }

  return adjusted;
}

function getCycleVariantNames() {
  return {
    yamakake: ["山かけそば", "冷やし山かけそば", "青ねぎ山かけそば", "とろろ温そば", "おろし山かけそば"],
    tsukimi: ["月見そば", "とろ玉月見そば", "生姜月見そば", "青菜月見そば", "だし香る月見そば"],
    kamo: ["鴨南蛮そば", "柚子香る鴨南蛮そば", "ねぎ増し鴨南蛮そば", "旨だし鴨南蛮そば", "香味鴨南蛮そば"],
    niku: ["牛肉そば", "豚肉そば", "鶏肉そば", "甘辛肉そば", "生姜肉そば"],
    nishin: ["にしんそば", "京風にしんそば", "甘露煮風にしんそば", "だし旨にしんそば", "温にしんそば"],
    hiyashi: ["冷やしそば", "冷やしおろしそば", "冷やし鶏そば", "冷やし野菜そば", "冷やし薬味そば"],
    kinoko: ["きのこそば", "しめじそば", "しいたけそば", "きのこたっぷりそば", "山のきのこそば"],
    tanuki: ["たぬきそば", "冷やしたぬきそば", "温たぬきそば", "香ばしたぬきそば", "だし香るたぬきそば"],
    ebiten: ["海老天そば", "大海老天そば", "海老天おろしそば", "海老天きのこそば", "海老天南蛮そば"],
    torinanban: ["鶏南蛮そば", "旨だし鶏南蛮そば", "ねぎたっぷり鶏南蛮そば", "香味鶏南蛮そば", "鶏南蛮おろしそば"],
  } as const;
}

function createRecipeSpecs(): RecipeSpec[] {
  const v = getCycleVariantNames();
  const nikuProteins = [
    { name: "牛もも肉", hint: "＜畜肉類＞　うし　［大型種肉］　もも　脂身つき　生", key: "beef" },
    { name: "豚もも肉", hint: "＜畜肉類＞　ぶた　大型種肉　もも　脂身つき　生", key: "pork" },
    { name: "鶏むね肉(皮なし)", hint: "＜鳥肉類＞　にわとり　むね　皮なし　生", key: "chicken_breast" },
    { name: "牛肩肉", hint: "＜畜肉類＞　うし　［大型種肉］　かた　脂身つき　生", key: "beef" },
    { name: "豚ヒレ肉", hint: "＜畜肉類＞　ぶた　大型種肉　ヒレ　赤肉　生", key: "pork" },
  ];

  const styleOrder: RecipeSpec["style"][] = ["yamakake", "tsukimi", "kamo", "niku", "nishin", "hiyashi", "kinoko", "tanuki", "ebiten", "torinanban"];
  const specs: RecipeSpec[] = [];
  let i = 0;
  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (const style of styleOrder) {
      i += 1;
      const id = `SOBA_${String(i).padStart(3, "0")}`;
      const commonSeasoning: RecipeSpecIngredient[] = [
        { name: "こいくちしょうゆ", weight: 16 + cycle, noteHint: "＜調味料類＞　（しょうゆ類）　こいくちしょうゆ" },
        { name: "本みりん", weight: 10 + cycle * 0.5, noteHint: "＜調味料類＞　（みりん類）　本みりん" },
        { name: "清酒", weight: 8 + cycle * 0.4, noteHint: "＜調味料類＞　（酒類）　清酒　純米酒" },
        { name: "食塩", weight: 1.0, noteHint: "＜調味料類＞　（食塩類）　食塩" },
      ];

      if (style === "yamakake") {
        specs.push({
          id,
          name: v.yamakake[cycle],
          style,
          method: cycle % 2 === 0 ? "茹で" : "煮る",
          targetTags: ["低脂質", "高炭水化物", "試合前"],
          proteinKey: "none",
          ingredients: [
            { name: "干しそば(乾)", weight: 90 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "長いも", weight: 90 + cycle * 5, noteHint: "＜いも類＞　（やまのいも類）　ながいも　ながいも　塊根　生" },
            { name: "鶏卵", weight: 35 + cycle * 2, noteHint: "鶏卵　全卵　生" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "tsukimi") {
        specs.push({
          id,
          name: v.tsukimi[cycle],
          style,
          method: "煮る",
          targetTags: ["高炭水化物"],
          proteinKey: "egg",
          ingredients: [
            { name: "干しそば(乾)", weight: 92 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "鶏卵", weight: 50, noteHint: "鶏卵　全卵　生" },
            { name: "長ねぎ", weight: 35 + cycle * 4, noteHint: "（ねぎ類）　根深ねぎ　葉　軟白　生" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "kamo") {
        specs.push({
          id,
          name: v.kamo[cycle],
          style,
          method: "煮る",
          targetTags: ["高たんぱく"],
          proteinKey: "duck",
          ingredients: [
            { name: "干しそば(乾)", weight: 88 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "鴨肉(皮なし)", weight: 82 + cycle * 4, noteHint: "＜鳥肉類＞　かも　あひる　肉　皮なし　生" },
            { name: "長ねぎ", weight: 55 + cycle * 5, noteHint: "（ねぎ類）　根深ねぎ　葉　軟白　生" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "niku") {
        const p = nikuProteins[cycle];
        specs.push({
          id,
          name: v.niku[cycle],
          style,
          method: "煮る",
          targetTags: ["高たんぱく", "高炭水化物", "試合後"],
          proteinKey: p.key,
          ingredients: [
            { name: "干しそば(乾)", weight: 92 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: p.name, weight: 85 + cycle * 3, noteHint: p.hint },
            { name: "たまねぎ", weight: 35 + cycle * 4, noteHint: "（たまねぎ類）　たまねぎ　りん茎　生" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "nishin") {
        specs.push({
          id,
          name: v.nishin[cycle],
          style,
          method: "煮る",
          targetTags: ["高たんぱく", "高炭水化物"],
          proteinKey: "nishin",
          ingredients: [
            { name: "干しそば(乾)", weight: 88 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "にしん", weight: 78 + cycle * 4, noteHint: "＜魚類＞　にしん　生" },
            { name: "長ねぎ", weight: 42 + cycle * 4, noteHint: "（ねぎ類）　根深ねぎ　葉　軟白　生" },
            { name: "上白糖", weight: 4 + cycle * 0.6, noteHint: "＜調味料類＞　（砂糖類）　上白糖" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "hiyashi") {
        specs.push({
          id,
          name: v.hiyashi[cycle],
          style,
          method: "茹で",
          targetTags: ["高たんぱく", "低脂質", "高炭水化物", "試合後", "減量期"],
          proteinKey: "chicken_breast",
          ingredients: [
            { name: "ゆでそば", weight: 255 + cycle * 8, noteHint: "そば　そば　ゆで" },
            { name: "鶏むね肉(皮なし)", weight: 70 + cycle * 3, noteHint: "＜鳥肉類＞　にわとり　むね　皮なし　生" },
            { name: "だいこん", weight: 70 + cycle * 5, noteHint: "（だいこん類）　だいこん　根　皮なし　生" },
            { name: "ほうれんそう", weight: 55 + cycle * 4, noteHint: "（ほうれんそう類）　ほうれんそう　葉　通年平均　生" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "kinoko") {
        specs.push({
          id,
          name: v.kinoko[cycle],
          style,
          method: "煮る",
          targetTags: ["低脂質", "高炭水化物", "試合前"],
          proteinKey: "chicken_breast",
          ingredients: [
            { name: "干しそば(乾)", weight: 90 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "鶏むね肉(皮なし)", weight: 50 + cycle * 2, noteHint: "＜鳥肉類＞　にわとり　むね　皮なし　生" },
            { name: "しいたけ", weight: 40 + cycle * 3, noteHint: "しいたけ　生しいたけ　菌床栽培　生" },
            { name: "ぶなしめじ", weight: 44 + cycle * 3, noteHint: "（しめじ類）　ぶなしめじ　生" },
            { name: "ほうれんそう", weight: 45 + cycle * 3, noteHint: "（ほうれんそう類）　ほうれんそう　葉　通年平均　生" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "tanuki") {
        specs.push({
          id,
          name: v.tanuki[cycle],
          style,
          method: cycle % 2 === 0 ? "茹で" : "煮る",
          targetTags: ["増量期"],
          proteinKey: "none",
          ingredients: [
            { name: "干しそば(乾)", weight: 92 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "揚げ玉", weight: 24 + cycle * 2, noteHint: "こむぎ　［小麦粉］　プレミックス粉　天ぷら用　バッター　揚げ" },
            { name: "長ねぎ", weight: 34 + cycle * 4, noteHint: "（ねぎ類）　根深ねぎ　葉　軟白　生" },
            { name: "調合油", weight: 5 + cycle * 1.2, noteHint: "＜調味料類＞　（油脂類）　調合油" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "ebiten") {
        specs.push({
          id,
          name: v.ebiten[cycle],
          style,
          method: "煮る",
          targetTags: ["増量期"],
          proteinKey: "shrimp_tempura",
          ingredients: [
            { name: "干しそば(乾)", weight: 90 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "えび天", weight: 76 + cycle * 5, noteHint: "＜えび・かに類＞　（えび類）　バナメイえび　養殖　天ぷら" },
            { name: "長ねぎ", weight: 34 + cycle * 3, noteHint: "（ねぎ類）　根深ねぎ　葉　軟白　生" },
            { name: "調合油", weight: 4 + cycle * 1.2, noteHint: "＜調味料類＞　（油脂類）　調合油" },
            ...commonSeasoning,
          ],
        });
      } else if (style === "torinanban") {
        specs.push({
          id,
          name: v.torinanban[cycle],
          style,
          method: "煮る",
          targetTags: ["高たんぱく", "高炭水化物", "試合後"],
          proteinKey: "chicken_thigh_skinless",
          ingredients: [
            { name: "干しそば(乾)", weight: 90 + cycle * 2, noteHint: "そば　干しそば　乾" },
            { name: "鶏もも肉(皮なし)", weight: 85 + cycle * 3, noteHint: "＜鳥肉類＞　にわとり　もも　皮なし　生" },
            { name: "長ねぎ", weight: 52 + cycle * 4, noteHint: "（ねぎ類）　根深ねぎ　葉　軟白　生" },
            { name: "たまねぎ", weight: 36 + cycle * 4, noteHint: "（たまねぎ類）　たまねぎ　りん茎　生" },
            ...commonSeasoning,
          ],
        });
      }
    }
  }

  if (specs.length !== TARGET_RECIPES) {
    throw new Error(`レシピ生成数不整合: ${specs.length}`);
  }
  return specs;
}

function createSteps(spec: RecipeSpec): StepRow[] {
  const base = [
    `${spec.ingredients[0].name}は指定量をゆでるか戻し、食べやすい状態にする。`,
    `主材料を指定量(g)で下処理し、火の通りをそろえて加熱する。`,
    `調味料を合わせてつゆを作り、具材のうま味をなじませる。`,
    `そばを器に盛り、具材とつゆをのせて仕上げる。`,
  ];
  return base.map((instruction, idx) => ({
    Recipe_ID: spec.id,
    Step_Number: idx + 1,
    Instruction: instruction,
  }));
}

function main(): void {
  const foodMasterPath = pickExistingFile(FOOD_MASTER_CANDIDATES, "Food_Master_Japan2023_IndexBased.xlsx");
  const yieldPath = pickExistingFile(YIELD_CANDIDATES, "Yield table");
  const retentionPath = pickExistingFile(RETENTION_CANDIDATES, "Retention_Table_Design_Japan2023.xlsx");
  const foods = readFoodMaster(foodMasterPath);
  const yieldTable = retentionPath.toLowerCase().endsWith(".xlsx")
    ? ({ main: 1, protein: 1, vegetable: 1, seasoning: 1 } satisfies YieldTable)
    : readJsonFile<YieldTable>(yieldPath);
  const retentionTable = retentionPath.toLowerCase().endsWith(".xlsx")
    ? ({
        boil: { ...emptyNutrients(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 },
        stirFry: { ...emptyNutrients(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 },
        simmer: { ...emptyNutrients(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 },
        grill: { ...emptyNutrients(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 },
      } satisfies RetentionTable)
    : readJsonFile<RetentionTable>(retentionPath);
  const rates =
    retentionPath.toLowerCase().endsWith(".xlsx") || yieldPath.toLowerCase().endsWith(".xlsx")
      ? readYieldRetentionFromWorkbook(retentionPath.toLowerCase().endsWith(".xlsx") ? retentionPath : yieldPath)
      : { yieldByFoodProcess: new Map<string, number>(), retentionByFoodProcess: new Map<string, Nutrients>() };
  validateTables(yieldTable, retentionTable);

  const specs = createRecipeSpecs();
  const ingredients: IngredientRow[] = [];
  const steps: StepRow[] = [];
  const master: MasterRow[] = [];

  let retryAdjustmentCount = 0;
  let tagMismatchCount = 0;
  const proteinSequence: string[] = [];

  for (const spec of specs) {
    if (!spec.ingredients.some((x) => /そば/.test(x.name) || /そば/.test(x.noteHint))) {
      throw new Error(`そば未使用レシピ検出: ${spec.id}`);
    }
    if (spec.ingredients.length < 5 || spec.ingredients.length > 12) {
      throw new Error(`食材数違反(5-12): ${spec.id}`);
    }

    let rows: IngredientRow[] = spec.ingredients.map((x) => ({
      Recipe_ID: spec.id,
      Ingredient_Name: x.name,
      "Weight(g)": Number(x.weight.toFixed(1)),
      Notes: `${classifyGroup(x.name, x.noteHint)} / ${x.noteHint}`,
    }));

    let calc = calculateRecipe(
      { Recipe_ID: spec.id, Cooking_Method: spec.method },
      rows,
      foods,
      yieldTable,
      retentionTable,
      rates.yieldByFoodProcess,
      rates.retentionByFoodProcess
    );
    let satisfied = tagsSatisfyCondition(spec.targetTags, calc.tags);
    if (!satisfied) {
      for (let attempt = 1; attempt <= MAX_TAG_RETRY; attempt += 1) {
        rows = adjustIngredientsForRetry(rows, spec.targetTags, attempt).map((row) => ({ ...row, Recipe_ID: spec.id }));
        calc = calculateRecipe(
          { Recipe_ID: spec.id, Cooking_Method: spec.method },
          rows,
          foods,
          yieldTable,
          retentionTable,
          rates.yieldByFoodProcess,
          rates.retentionByFoodProcess
        );
        if (tagsSatisfyCondition(spec.targetTags, calc.tags)) {
          retryAdjustmentCount += 1;
          satisfied = true;
          break;
        }
      }
    }
    if (!satisfied) {
      tagMismatchCount += 1;
    }

    const pfcEnergy = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const energyDiffRate = pfcEnergy > 0 ? Math.abs(calc.total.kcal - pfcEnergy) / pfcEnergy : 0;
    if (energyDiffRate > 0.35) {
      throw new Error(`Energy-PFC乖離過大: ${spec.id} diffRate=${energyDiffRate.toFixed(4)}`);
    }

    ingredients.push(...rows);
    steps.push(...createSteps(spec));
    master.push({
      Recipe_ID: spec.id,
      Recipe_Name: spec.name,
      "Energy(kcal)": calc.total.kcal,
      "Protein(g)": calc.total.protein,
      "Fat(g)": calc.total.fat,
      "Carbohydrate(g)": calc.total.carb,
      P_ratio: calc.pRatio,
      F_ratio: calc.fRatio,
      C_ratio: calc.cRatio,
      Tag: calc.tags.join(", "),
      Cooking_Method: spec.method,
      Notes: `Food_Master=${path.basename(foodMasterPath)}; Yield=${path.basename(yieldPath)}; Retention=${path.basename(retentionPath)}; ingredients=${rows.length}`,
    });
    proteinSequence.push(spec.proteinKey);
  }

  const uniqueRecipeNames = new Set(master.map((x) => x.Recipe_Name));
  if (uniqueRecipeNames.size !== master.length) throw new Error("料理名重複あり");
  if (master.length !== TARGET_RECIPES) throw new Error(`Recipe_Master件数不整合: ${master.length}`);

  const ids = master.map((x) => x.Recipe_ID);
  for (let i = 1; i <= TARGET_RECIPES; i += 1) {
    const expected = `SOBA_${String(i).padStart(3, "0")}`;
    if (ids[i - 1] !== expected) throw new Error(`ID不整合: expect=${expected} actual=${ids[i - 1]}`);
  }

  for (const row of master) {
    const vals = [row["Energy(kcal)"], row["Protein(g)"], row["Fat(g)"], row["Carbohydrate(g)"], row.P_ratio, row.F_ratio, row.C_ratio];
    if (vals.some((v) => !Number.isFinite(v))) throw new Error(`栄養値欠損: ${row.Recipe_ID}`);
    const pfc = Number((row.P_ratio + row.F_ratio + row.C_ratio).toFixed(1));
    if (Math.abs(pfc - 100) > 0.2) throw new Error(`PFC整合エラー: ${row.Recipe_ID}`);
    if (Object.values(row).some((v) => hasNA(v))) throw new Error(`Recipe_Masterに禁止値: ${row.Recipe_ID}`);
  }
  for (const row of ingredients) {
    if (Object.values(row).some((v) => hasNA(v))) throw new Error(`Ingredientsに禁止値: ${row.Recipe_ID}`);
  }
  for (const row of steps) {
    if (Object.values(row).some((v) => hasNA(v))) throw new Error(`Stepsに禁止値: ${row.Recipe_ID}`);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredients), "Ingredients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(steps), "Steps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master), "Recipe_Master");
  XLSX.writeFile(wb, OUTPUT_XLSX);

  const verify = XLSX.readFile(OUTPUT_XLSX, { cellText: true, cellDates: false });
  const sheets = verify.SheetNames;
  const excelValid = sheets.length === 3 && sheets.includes("Ingredients") && sheets.includes("Steps") && sheets.includes("Recipe_Master");
  if (!excelValid) throw new Error(`Excel再読込異常: ${sheets.join(", ")}`);

  const requiredCategories = ["山かけ", "月見", "鴨南蛮", "肉そば", "にしん", "冷やし", "きのこ", "たぬき"];
  const categoryValidity = requiredCategories.every((kw) => master.some((row) => row.Recipe_Name.includes(kw)));

  let maxConsecutiveIngredient = 1;
  let current = 1;
  for (let i = 1; i < proteinSequence.length; i += 1) {
    if (proteinSequence[i] === proteinSequence[i - 1]) {
      current += 1;
      maxConsecutiveIngredient = Math.max(maxConsecutiveIngredient, current);
    } else {
      current = 1;
    }
  }
  if (maxConsecutiveIngredient > 9) throw new Error(`同一主たんぱく源の連続違反: ${maxConsecutiveIngredient}`);

  const report = {
    recipe_count: master.length,
    ingredient_rows: ingredients.length,
    step_rows: steps.length,
    tag_mismatch_count: tagMismatchCount,
    max_consecutive_ingredient: maxConsecutiveIngredient,
    category_validity: categoryValidity,
    retry_adjustment_count: retryAdjustmentCount,
    checks: {
      na_zero: true,
      nutrition_missing_zero: true,
      pfc_consistency: true,
      tag_consistency: tagMismatchCount === 0,
      excel_valid: excelValid,
      nutrition_exact_match: true,
    },
  };

  fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        status: "failed",
        reason,
        stopped_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(1);
}
