const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = process.cwd();
const FOOD_CANDS = [
  "C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx",
  path.resolve(ROOT, "Food_Master_Japan2023_IndexBased.xlsx"),
  path.resolve(ROOT, "source_japan2023.xlsx"),
  path.resolve(ROOT, "food_source.xlsx"),
];
const RET_CANDS = [
  "C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx",
  path.resolve(ROOT, "Retention_Table_Design_Japan2023.xlsx"),
];
const GOHAN_DB = path.resolve(ROOT, "recipe_db_gohan_120.xlsx");
const OUT_XLSX = path.resolve(ROOT, "recipe_db_soup_100_batch1.xlsx");
const OUT_REPORT = path.resolve(ROOT, "soup_generation_report_batch1.json");

const TARGET = 100;
const ID_PREFIX = "SOUP_";
const MAX_RETRY = 4;
const KCAL_LIMIT = 220;
const PROTEIN_LIMIT = 10;
const SOUP_MIN_G = 160;
const SOUP_MAX_G = 260;

const NKEYS = [
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

const METHOD_TO_PROFILE = {
  "茹で": "boil",
  "炒め": "stirFry",
  "煮る": "simmer",
  "焼く": "grill",
};
const METHOD_TO_PROCESS = {
  "茹で": "BOIL",
  "炒め": "SAUTE",
  "煮る": "SIMMER",
  "焼く": "GRILL",
};

const n = (v) => {
  const s = String(v ?? "").trim();
  if (!s || s === "-" || /^tr$/i.test(s) || /^\(tr\)$/i.test(s)) return 0;
  const x = Number(s.replace(/,/g, "").replace(/[()]/g, ""));
  return Number.isFinite(x) ? x : 0;
};

const norm = (v) =>
  String(v || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[・･()\[\]{}\-_,.]/g, "");

const hasNA = (v) => typeof v === "string" && /#N\/A|#REF!|#VALUE!/i.test(v);

const empty = () => ({
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
});

const roundN = (x) => {
  const o = { ...x };
  for (const k of NKEYS) o[k] = Number((o[k] || 0).toFixed(3));
  return o;
};

const sumN = (arr) =>
  arr.reduce((a, b) => {
    for (const k of NKEYS) a[k] += b[k] || 0;
    return a;
  }, empty());

const pickFile = (cands, label) => {
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error(`missing ${label}: ${cands.join(" / ")}`);
};

function readFoods(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const ws = wb.Sheets.Food_Master_Numeric || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const foods = rows
    .map((r) => ({
      foodNo: String(r.Food_No || "").trim().replace(/^0+/, ""),
      foodName: String(r.Food_Name || "").trim(),
      refusePercent: n(r.REFUSE),
      kcal: n(r.ENERC_KCAL),
      protein: n(r["PROT-"]),
      fat: n(r["FAT-"]),
      carb: n(r["CHOCDF-"]),
      calcium: n(r.CA),
      iron: n(r.FE),
      vitaminB1: n(r.THIA),
      vitaminB2: n(r.RIBF),
      vitaminB6: n(r.VITB6A),
      vitaminB12: n(r.VITB12),
      vitaminC: n(r.VITC),
      vitaminD: n(r.VITD),
      rae: n(r.VITA_RAE),
      salt: n(r.NACL_EQ),
    }))
    .filter((f) => f.foodNo && f.foodName);
  if (!foods.length) throw new Error("food master empty");
  return foods;
}

function readYieldRetention(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const y = wb.Sheets.Yield_Table;
  const r = wb.Sheets.Retention_Table;
  if (!y || !r) throw new Error("Yield_Table / Retention_Table missing");

  const yRows = XLSX.utils.sheet_to_json(y, { defval: "" });
  const rRows = XLSX.utils.sheet_to_json(r, { defval: "" });

  const yMap = new Map();
  for (const row of yRows) {
    const fid = String(row.Food_ID || "").trim().replace(/^0+/, "");
    const p = String(row.Process || "").trim().toUpperCase();
    const rate = n(row.Yield_Rate);
    if (fid && p && rate > 0) yMap.set(`${fid}|${p}`, rate);
  }

  const map = {
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
    Salt: "salt",
  };

  const rMap = new Map();
  for (const row of rRows) {
    const fid = String(row.Food_ID || "").trim().replace(/^0+/, "");
    const p = String(row.Process || "").trim().toUpperCase();
    const key = map[String(row.Nutrient || "").trim()];
    if (!fid || !p || !key) continue;
    const rate = n(row.Retention_Rate);
    const k = `${fid}|${p}`;
    const o = rMap.get(k) || empty();
    o[key] = rate > 0 ? rate : 1;
    rMap.set(k, o);
  }

  for (const [k, o] of rMap.entries()) {
    for (const nk of NKEYS) if (!(o[nk] > 0)) o[nk] = 1;
    rMap.set(k, o);
  }

  const yDef = { vegetable: 1, broth: 1, seasoning: 1 };
  const one = {
    ...empty(),
    kcal: 1,
    protein: 1,
    fat: 1,
    carb: 1,
    calcium: 1,
    iron: 1,
    vitaminB1: 1,
    vitaminB2: 1,
    vitaminB6: 1,
    vitaminB12: 1,
    vitaminC: 1,
    vitaminD: 1,
    rae: 1,
    salt: 1,
  };
  const rDef = { boil: one, stirFry: one, simmer: one, grill: one };
  return { yMap, rMap, yDef, rDef };
}

function verifyReferenceDb(file) {
  if (!fs.existsSync(file)) throw new Error(`required file missing: ${file}`);
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  for (const s of ["Ingredients", "Steps", "Recipe_Master"]) {
    if (!wb.SheetNames.includes(s)) throw new Error(`invalid reference db (missing ${s}): ${file}`);
  }
}

function findFoodByName(foods, q) {
  const nq = norm(q);
  if (!nq) return null;
  const exact = foods.find((f) => norm(f.foodName) === nq);
  if (exact) return exact;
  const includes = foods.filter((f) => norm(f.foodName).includes(nq) || nq.includes(norm(f.foodName)));
  return includes[0] || null;
}

function pickFoodByTokens(foods, ...tokens) {
  const tn = tokens.map((t) => norm(t));
  const hit = foods.find((f) => {
    const fn = norm(f.foodName);
    return tn.every((t) => fn.includes(t));
  });
  if (!hit) throw new Error(`food not found by tokens: ${tokens.join("/")}`);
  return hit;
}

function groupOf(notes) {
  const g = String(notes).split("/")[0].trim();
  return ["vegetable", "broth", "seasoning"].includes(g) ? g : "vegetable";
}

function parseFoodName(notes) {
  return String(notes).split("/").slice(-1)[0].trim();
}

function scale(food, rawW, group, yDef, ret) {
  const edible = Math.max(0, Math.min(1, (100 - food.refusePercent) / 100));
  const finalW = rawW * edible * yDef[group];
  const o = empty();
  for (const k of NKEYS) o[k] = (food[k] * finalW * ret[k]) / 100;
  return o;
}

function tagsFrom(total) {
  const t = [];
  if (total.protein <= 8) t.push("主菜化回避");
  if (total.fat <= 8) t.push("低脂質");
  if (total.salt <= 2.2) t.push("汁物");
  return [...new Set(t)];
}

function rowOf(id, it) {
  return {
    Recipe_ID: id,
    Ingredient_Name: it.name,
    "Weight(g)": Number(it.w.toFixed(1)),
    Notes: `${it.g} / ${it.foodName}`,
  };
}

function calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap) {
  const m = METHOD_TO_PROFILE[spec.method];
  const pc = METHOD_TO_PROCESS[spec.method] || "RAW";
  if (!m) throw new Error(`unknown method: ${spec.id} ${spec.method}`);

  const calcRows = [];
  for (const row of rows) {
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row["Weight(g)"]) || hasNA(row.Notes)) {
      throw new Error(`NA in ingredients: ${spec.id}`);
    }
    const w = n(row["Weight(g)"]);
    if (!(w > 0)) throw new Error(`weight invalid: ${spec.id}`);

    const hint = parseFoodName(row.Notes);
    const food = findFoodByName(foods, hint) || findFoodByName(foods, row.Ingredient_Name);
    if (!food) throw new Error(`food not found: ${spec.id} ${row.Ingredient_Name}`);

    const g = groupOf(row.Notes);
    const oy = yMap.get(`${food.foodNo}|${pc}`);
    const yUse = { ...yDef, [g]: oy && oy > 0 ? oy : yDef[g] };
    const ret = rMap.get(`${food.foodNo}|${pc}`) || rDef[m];
    const contrib = scale(food, w, g, yUse, ret);
    calcRows.push({ ...row, food, g, contrib });
  }

  const total = roundN(sumN(calcRows.map((x) => x.contrib)));
  const pe = total.protein * 4;
  const fe = total.fat * 9;
  const ce = total.carb * 4;
  const den = Math.max(1, pe + fe + ce);
  const pRatio = Number(((pe / den) * 100).toFixed(1));
  const fRatio = Number(((fe / den) * 100).toFixed(1));
  const cRatio = Number(((ce / den) * 100).toFixed(1));
  const tags = tagsFrom(total);

  const soupW = rows.filter((r) => groupOf(r.Notes) === "broth").reduce((a, r) => a + n(r["Weight(g)"]), 0);
  const mainDishTokens = [
    "牛肉",
    "豚肉",
    "鶏肉",
    "鶏もも",
    "鶏むね",
    "まぐろ",
    "さば",
    "鮭",
    "ぶり",
    "いわし",
    "あじ",
    "卵",
    "たまご",
    "ハム",
    "ソーセージ",
  ];
  const mainish = rows.some((r) => {
    const t = `${r.Ingredient_Name} ${r.Notes}`;
    return mainDishTokens.some((x) => t.includes(x));
  });
  const categoryUnitOk = soupW >= SOUP_MIN_G && soupW <= SOUP_MAX_G && !mainish && total.protein <= PROTEIN_LIMIT;

  return { total, pRatio, fRatio, cRatio, tags, soupW, categoryUnitOk };
}

function scaleW(row, ratio, min = 0.2) {
  row["Weight(g)"] = Number(Math.max(min, n(row["Weight(g)"]) * ratio).toFixed(1));
}

function retryAdjust(rows, attempt, mode) {
  const a = rows.map((r) => ({ ...r }));
  const brothRows = a.filter((r) => groupOf(r.Notes) === "broth");
  const highDensity = a.filter((r) => /(みそ|豆腐|豆乳|コーン|牛乳|じゃがいも)/.test(`${r.Ingredient_Name} ${r.Notes}`));

  const brothUp = [1.05, 1.1, 1.15, 1.2][attempt - 1] || 1.2;
  const brothDown = [0.94, 0.9, 0.86, 0.82][attempt - 1] || 0.82;
  const densityDown = [0.92, 0.84, 0.76, 0.68][attempt - 1] || 0.68;

  for (const r of brothRows) {
    if (mode === "broth-down") scaleW(r, brothDown, 10);
    else scaleW(r, brothUp, 10);
  }
  for (const r of highDensity) scaleW(r, densityDown, 0.5);
  return a;
}

function mkSteps(spec) {
  const lines = [
    "具材を食べやすい大きさに切る。",
    `${spec.soupType}のベースと具材を温め、火の通りを整える。`,
    "調味をして器に注ぎ、温かいうちに供する。",
  ];
  return lines.map((x, i) => ({ Recipe_ID: spec.id, Step_Number: i + 1, Instruction: x }));
}

function buildIngredients(foods) {
  const food = {
    miso: pickFoodByTokens(foods, "米みそ", "淡色辛みそ"),
    dashiWafu: pickFoodByTokens(foods, "かつお", "昆布", "だし"),
    chukaDashi: pickFoodByTokens(foods, "中華だし"),
    westernDashi: pickFoodByTokens(foods, "洋風だし"),
    soyMilk: pickFoodByTokens(foods, "豆乳", "豆乳"),
    cornCream: pickFoodByTokens(foods, "スイートコーン", "クリームスタイル"),
    milk: pickFoodByTokens(foods, "普通牛乳"),
    tofu: pickFoodByTokens(foods, "絹ごし豆腐"),
    wakame: pickFoodByTokens(foods, "わかめ", "水煮"),
    negi: pickFoodByTokens(foods, "根深ねぎ", "生"),
    onion: pickFoodByTokens(foods, "たまねぎ", "生"),
    carrot: pickFoodByTokens(foods, "にんじん", "生"),
    potato: pickFoodByTokens(foods, "じゃがいも", "皮なし", "生"),
    cabbage: pickFoodByTokens(foods, "キャベツ", "生"),
    komatsuna: pickFoodByTokens(foods, "こまつな", "生"),
    shimeji: pickFoodByTokens(foods, "しめじ", "生"),
    shiitake: pickFoodByTokens(foods, "しいたけ", "生"),
    cornKernel: pickFoodByTokens(foods, "スイートコーン", "ホールカーネル"),
    shoyu: pickFoodByTokens(foods, "こいくちしょうゆ"),
    salt: pickFoodByTokens(foods, "食塩類", "食塩"),
  };

  const wrap = (name, f) => ({ name, foodName: f.foodName });
  return {
    miso: wrap("米みそ", food.miso),
    dashiWafu: wrap("和風だし", food.dashiWafu),
    chukaDashi: wrap("中華だし", food.chukaDashi),
    westernDashi: wrap("洋風だし", food.westernDashi),
    soyMilk: wrap("豆乳", food.soyMilk),
    cornCream: wrap("クリームコーン", food.cornCream),
    milk: wrap("牛乳", food.milk),
    tofu: wrap("絹ごし豆腐", food.tofu),
    wakame: wrap("わかめ", food.wakame),
    negi: wrap("ねぎ", food.negi),
    onion: wrap("たまねぎ", food.onion),
    carrot: wrap("にんじん", food.carrot),
    potato: wrap("じゃがいも", food.potato),
    cabbage: wrap("キャベツ", food.cabbage),
    komatsuna: wrap("こまつな", food.komatsuna),
    shimeji: wrap("しめじ", food.shimeji),
    shiitake: wrap("しいたけ", food.shiitake),
    cornKernel: wrap("ホールコーン", food.cornKernel),
    shoyu: wrap("こいくちしょうゆ", food.shoyu),
    salt: wrap("食塩", food.salt),
  };
}

function makeSpecs(foods) {
  const F = buildIngredients(foods);

  const styles = [
    {
      key: "miso_tofu_wakame",
      label: "豆腐わかめ味噌汁",
      soupType: "味噌汁",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.dashiWafu, w: 170 + i * 4.5 },
        { g: "vegetable", ...F.tofu, w: 24 + i * 1.0 },
        { g: "vegetable", ...F.wakame, w: 10 + i * 0.5 },
        { g: "vegetable", ...F.negi, w: 8 + i * 0.4 },
        { g: "seasoning", ...F.miso, w: 11 + i * 0.25 },
      ],
    },
    {
      key: "sumashi_komatsuna_shiitake",
      label: "小松菜しいたけすまし汁",
      soupType: "すまし汁",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.dashiWafu, w: 180 + i * 4.0 },
        { g: "vegetable", ...F.komatsuna, w: 28 + i * 1.0 },
        { g: "vegetable", ...F.shiitake, w: 14 + i * 0.6 },
        { g: "vegetable", ...F.negi, w: 8 + i * 0.4 },
        { g: "seasoning", ...F.shoyu, w: 3.2 + i * 0.08 },
        { g: "seasoning", ...F.salt, w: 0.5 + i * 0.02 },
      ],
    },
    {
      key: "chuka_cabbage_corn",
      label: "キャベツコーン中華スープ",
      soupType: "中華スープ",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.chukaDashi, w: 175 + i * 4.2 },
        { g: "vegetable", ...F.cabbage, w: 34 + i * 1.2 },
        { g: "vegetable", ...F.cornKernel, w: 12 + i * 0.8 },
        { g: "vegetable", ...F.negi, w: 8 + i * 0.4 },
        { g: "seasoning", ...F.salt, w: 0.45 + i * 0.02 },
      ],
    },
    {
      key: "western_potato_onion",
      label: "じゃがいもたまねぎ洋風スープ",
      soupType: "洋風スープ",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.westernDashi, w: 180 + i * 4.4 },
        { g: "vegetable", ...F.potato, w: 26 + i * 1.3 },
        { g: "vegetable", ...F.onion, w: 24 + i * 1.1 },
        { g: "vegetable", ...F.carrot, w: 12 + i * 0.6 },
        { g: "seasoning", ...F.salt, w: 0.5 + i * 0.02 },
      ],
    },
    {
      key: "soymilk_komatsuna_shimeji",
      label: "小松菜しめじ豆乳スープ",
      soupType: "豆乳スープ",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.soyMilk, w: 165 + i * 3.8 },
        { g: "broth", ...F.dashiWafu, w: 30 + i * 1.2 },
        { g: "vegetable", ...F.komatsuna, w: 20 + i * 1.0 },
        { g: "vegetable", ...F.shimeji, w: 14 + i * 0.7 },
        { g: "seasoning", ...F.miso, w: 5.5 + i * 0.2 },
      ],
    },
    {
      key: "corn_milk",
      label: "コーンミルクスープ",
      soupType: "コーンスープ",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.cornCream, w: 110 + i * 2.5 },
        { g: "broth", ...F.milk, w: 60 + i * 1.6 },
        { g: "broth", ...F.westernDashi, w: 22 + i * 1.0 },
        { g: "vegetable", ...F.onion, w: 10 + i * 0.6 },
        { g: "seasoning", ...F.salt, w: 0.45 + i * 0.02 },
      ],
    },
    {
      key: "miso_cabbage_carrot",
      label: "キャベツにんじん味噌汁",
      soupType: "味噌汁",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.dashiWafu, w: 175 + i * 4.2 },
        { g: "vegetable", ...F.cabbage, w: 30 + i * 1.3 },
        { g: "vegetable", ...F.carrot, w: 15 + i * 0.7 },
        { g: "vegetable", ...F.negi, w: 8 + i * 0.4 },
        { g: "seasoning", ...F.miso, w: 10 + i * 0.25 },
      ],
    },
    {
      key: "sumashi_tofu_negi",
      label: "豆腐ねぎすまし汁",
      soupType: "すまし汁",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.dashiWafu, w: 178 + i * 4.0 },
        { g: "vegetable", ...F.tofu, w: 22 + i * 1.0 },
        { g: "vegetable", ...F.negi, w: 12 + i * 0.6 },
        { g: "vegetable", ...F.shiitake, w: 10 + i * 0.5 },
        { g: "seasoning", ...F.shoyu, w: 3.0 + i * 0.08 },
      ],
    },
    {
      key: "chuka_onion_shimeji",
      label: "たまねぎしめじ中華スープ",
      soupType: "中華スープ",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.chukaDashi, w: 176 + i * 4.0 },
        { g: "vegetable", ...F.onion, w: 26 + i * 1.2 },
        { g: "vegetable", ...F.shimeji, w: 16 + i * 0.8 },
        { g: "vegetable", ...F.negi, w: 8 + i * 0.4 },
        { g: "seasoning", ...F.salt, w: 0.45 + i * 0.02 },
      ],
    },
    {
      key: "western_soy_corn",
      label: "豆乳コーン洋風スープ",
      soupType: "洋風スープ",
      method: "煮る",
      build: (i) => [
        { g: "broth", ...F.soyMilk, w: 130 + i * 3.0 },
        { g: "broth", ...F.westernDashi, w: 60 + i * 2.2 },
        { g: "vegetable", ...F.cornKernel, w: 16 + i * 0.8 },
        { g: "vegetable", ...F.onion, w: 16 + i * 0.7 },
        { g: "seasoning", ...F.salt, w: 0.45 + i * 0.02 },
      ],
    },
  ];

  const specs = [];
  let idn = 1;
  for (const style of styles) {
    for (let i = 0; i < 10; i += 1) {
      const id = `${ID_PREFIX}${String(idn).padStart(3, "0")}`;
      const ing = style.build(i);
      if (ing.length < 5 || ing.length > 12) throw new Error(`ingredient count invalid: ${id}`);
      specs.push({
        id,
        styleKey: style.key,
        styleLabel: style.label,
        soupType: style.soupType,
        name: `${style.label}${i + 1}`,
        method: style.method,
        ingredients: ing,
      });
      idn += 1;
    }
  }

  if (specs.length !== TARGET) throw new Error(`spec count mismatch: ${specs.length}`);
  return { specs };
}

function main() {
  const foodPath = pickFile(FOOD_CANDS, "food_master");
  const retPath = pickFile(RET_CANDS, "yield_retention");
  verifyReferenceDb(GOHAN_DB);

  const foods = readFoods(foodPath);
  const { yMap, rMap, yDef, rDef } = readYieldRetention(retPath);
  const { specs } = makeSpecs(foods);

  const ingredients = [];
  const steps = [];
  const master = [];
  const styleCounts = {};
  const soupTypeCounts = {};

  let retryCount = 0;
  let proteinViolationCount = 0;
  let kcalViolationCount = 0;
  let categoryViolationCount = 0;

  for (const spec of specs) {
    let rows = spec.ingredients.map((it) => rowOf(spec.id, it));
    let calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);

    if (!calc.categoryUnitOk || calc.total.kcal > KCAL_LIMIT || calc.total.protein > PROTEIN_LIMIT) {
      for (let a = 1; a <= MAX_RETRY; a += 1) {
        const mode = calc.soupW > SOUP_MAX_G ? "broth-down" : "broth-up";
        rows = retryAdjust(rows, a, mode).map((r) => ({ ...r, Recipe_ID: spec.id }));
        calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
        if (calc.categoryUnitOk && calc.total.kcal <= KCAL_LIMIT && calc.total.protein <= PROTEIN_LIMIT) {
          retryCount += 1;
          break;
        }
      }
    }

    if (calc.total.protein > PROTEIN_LIMIT) proteinViolationCount += 1;
    if (calc.total.kcal > KCAL_LIMIT) kcalViolationCount += 1;
    if (!calc.categoryUnitOk) categoryViolationCount += 1;

    const pfcE = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const diff = pfcE > 0 ? Math.abs(calc.total.kcal - pfcE) / pfcE : 0;
    if (diff > 0.45) throw new Error(`energy mismatch: ${spec.id}`);

    ingredients.push(...rows);
    steps.push(...mkSteps(spec));
    master.push({
      Recipe_ID: spec.id,
      Recipe_Name: spec.name,
      "Energy(kcal)": calc.total.kcal,
      "Protein(g)": calc.total.protein,
      "Fat(g)": calc.total.fat,
      "Carbohydrate(g)": calc.total.carb,
      "Calcium(mg)": calc.total.calcium,
      "Iron(mg)": calc.total.iron,
      "VitaminB1(mg)": calc.total.vitaminB1,
      "VitaminB2(mg)": calc.total.vitaminB2,
      "VitaminB6(mg)": calc.total.vitaminB6,
      "VitaminB12(ug)": calc.total.vitaminB12,
      "VitaminC(mg)": calc.total.vitaminC,
      "VitaminD(ug)": calc.total.vitaminD,
      "RetinolEq(ug)": calc.total.rae,
      "Salt(g)": calc.total.salt,
      P_ratio: calc.pRatio,
      F_ratio: calc.fRatio,
      C_ratio: calc.cRatio,
      Tag: calc.tags.join(", "),
      Cooking_Method: spec.method,
      Notes: `Category=汁物; SoupType=${spec.soupType}; Style=${spec.styleLabel}; soup_weight_g=${Number(
        calc.soupW.toFixed(1)
      )}; category_validity=${calc.categoryUnitOk}; Food_Master=${path.basename(foodPath)}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });

    styleCounts[spec.styleLabel] = (styleCounts[spec.styleLabel] || 0) + 1;
    soupTypeCounts[spec.soupType] = (soupTypeCounts[spec.soupType] || 0) + 1;
  }

  if (master.length !== TARGET) throw new Error("recipe count mismatch");
  for (let i = 1; i <= TARGET; i += 1) {
    const ex = `${ID_PREFIX}${String(i).padStart(3, "0")}`;
    if (master[i - 1].Recipe_ID !== ex) throw new Error(`id mismatch: ${ex}`);
  }

  for (const r of master) {
    if (Object.values(r).some(hasNA)) throw new Error(`NA in master: ${r.Recipe_ID}`);
    const s = Number((r.P_ratio + r.F_ratio + r.C_ratio).toFixed(1));
    if (Math.abs(s - 100) > 0.5) throw new Error(`pfc ratio fail: ${r.Recipe_ID}`);
  }
  for (const r of ingredients) if (Object.values(r).some(hasNA)) throw new Error(`NA in ingredients: ${r.Recipe_ID}`);
  for (const r of steps) if (Object.values(r).some(hasNA)) throw new Error(`NA in steps: ${r.Recipe_ID}`);

  const proteins = master.map((r) => n(r["Protein(g)"]));
  const kcals = master.map((r) => n(r["Energy(kcal)"]));
  const soupWeights = master.map((r) => {
    const m = String(r.Notes).match(/soup_weight_g=([0-9.]+)/);
    return m ? Number(m[1]) : 0;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredients), "Ingredients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(steps), "Steps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master), "Recipe_Master");
  XLSX.writeFile(wb, OUT_XLSX);

  const v = XLSX.readFile(OUT_XLSX, { cellText: true, cellDates: false });
  const excelValid =
    v.SheetNames.length === 3 && ["Ingredients", "Steps", "Recipe_Master"].every((s) => v.SheetNames.includes(s));
  if (!excelValid) throw new Error("xlsx structure invalid");

  const report = {
    recipe_count: master.length,
    ingredient_rows: ingredients.length,
    step_rows: steps.length,
    output_files: [path.basename(OUT_XLSX), path.basename(OUT_REPORT)],
    id_range: [`${ID_PREFIX}001`, `${ID_PREFIX}100`],
    soup_type_counts: soupTypeCounts,
    style_counts: styleCounts,
    retry_adjustment_count: retryCount,
    soup_weight_range_g: {
      min: Number(Math.min(...soupWeights).toFixed(1)),
      max: Number(Math.max(...soupWeights).toFixed(1)),
    },
    protein_range_g: {
      min: Number(Math.min(...proteins).toFixed(3)),
      max: Number(Math.max(...proteins).toFixed(3)),
    },
    energy_range_kcal: {
      min: Number(Math.min(...kcals).toFixed(3)),
      max: Number(Math.max(...kcals).toFixed(3)),
    },
    violation_counts: {
      protein_over_limit: proteinViolationCount,
      kcal_over_limit: kcalViolationCount,
      category_invalid: categoryViolationCount,
    },
    checks: {
      na_zero: true,
      excel_valid: excelValid,
      pfc_consistency: true,
      energy_consistency: true,
      soup_category_validity: categoryViolationCount === 0,
      soup_weight_range_validity: Math.min(...soupWeights) >= SOUP_MIN_G && Math.max(...soupWeights) <= SOUP_MAX_G,
      no_main_dish_bias: proteinViolationCount === 0,
      yield_table_used: true,
      retention_table_used: true,
    },
    source_files: {
      food_master: path.basename(foodPath),
      retention_and_yield: path.basename(retPath),
      reference_recipe_db: path.basename(GOHAN_DB),
    },
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (e) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        reason: e && e.message ? e.message : String(e),
        stopped_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(1);
}
