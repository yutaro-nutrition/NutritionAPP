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
const OUT_XLSX = path.resolve(ROOT, "recipe_db_side_lowprotein_100_batch1.xlsx");
const OUT_REPORT = path.resolve(ROOT, "side_lowprotein_generation_report_batch1.json");

const TARGET = 100;
const MAX_RETRY = 5;
const PROTEIN_LIMIT = 5.0;
const KCAL_LIMIT = 220;
const ID_PREFIX = "SIDE_LP_";

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

const METHOD_TO_PROFILE = { 茹で: "boil", 炒め: "stirFry", 煮る: "simmer", 焼き: "grill" };
const METHOD_TO_PROCESS = { 茹で: "BOIL", 炒め: "SAUTE", 煮る: "SIMMER", 焼き: "GRILL" };

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
    .replace(/[・･()（）\[\]{}\-_,.]/g, "");
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
const sumN = (arr) =>
  arr.reduce((a, b) => {
    for (const k of NKEYS) a[k] += b[k] || 0;
    return a;
  }, empty());
const roundN = (x) => {
  const o = { ...x };
  for (const k of NKEYS) o[k] = Number((o[k] || 0).toFixed(3));
  return o;
};

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
      foodNo: String(r.Food_No || r["食品番号"] || "").trim().replace(/^0+/, ""),
      foodName: String(r.Food_Name || r["食品名"] || "").trim(),
      refusePercent: n(r.REFUSE || r["廃棄率"]),
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

  const yDef = { vegetable: 1, seasoning: 1 };
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

function readGohanCatalog(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Ingredients, { defval: "" });
  const m = new Map();
  for (const r of rows) {
    const d = String(r.Ingredient_Display || "").trim();
    const foodName = String(r.Food_Name || "").trim();
    if (d && foodName && !m.has(d)) m.set(d, foodName);
  }
  return m;
}

function findFoodByName(foods, q) {
  const nq = norm(q);
  if (!nq) return null;
  const exact = foods.find((f) => norm(f.foodName) === nq);
  if (exact) return exact;
  const includes = foods.filter((f) => norm(f.foodName).includes(nq) || nq.includes(norm(f.foodName)));
  return includes[0] || null;
}

function resolveByDisplay(foods, catalog, display) {
  const preferred = catalog.get(display);
  if (preferred) {
    const hit = findFoodByName(foods, preferred);
    if (hit) return hit;
  }
  const fallback = findFoodByName(foods, display);
  if (fallback) return fallback;
  throw new Error(`food resolve failed: ${display}`);
}

function tagsFrom(total, digestible, hasIrritant) {
  const t = [];
  if (total.protein >= 20) t.push("高たんぱく");
  if (total.fat < 10) t.push("低脂質");
  if (total.carb >= 70) t.push("高炭水化物");
  if (total.fat < 10 && digestible && !hasIrritant) t.push("試合前");
  if (total.protein >= 20 && total.carb >= 70) t.push("試合後");
  if (total.kcal >= 650 || total.fat >= 20) t.push("増量期");
  if (total.protein >= 20 && total.fat < 10) t.push("減量期");
  return [...new Set(t)];
}

function groupOf(notes) {
  const g = String(notes).split("/")[0].trim();
  return ["vegetable", "seasoning"].includes(g) ? g : "vegetable";
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

  const text = rows.map((r) => `${r.Ingredient_Name} ${r.Notes}`).join(" ");
  const hasIrritant = /にんにく|ラー油|唐辛子|こしょう|キムチ/.test(text);
  const digestible = spec.method === "茹で" || spec.method === "煮る";
  const tags = tagsFrom(total, digestible, hasIrritant);

  const groupsOk = rows.every((r) => ["vegetable", "seasoning"].includes(groupOf(r.Notes)));
  const noStapleWord = rows.every(
    (r) => !/精白米|ごはん|うどん|そば|ラーメン|パン|黒米|赤米/.test(`${r.Ingredient_Name} ${r.Notes}`)
  );
  const categoryUnitOk = groupsOk && noStapleWord && total.protein < PROTEIN_LIMIT;

  return { total, pRatio, fRatio, cRatio, tags, categoryUnitOk };
}

function scaleW(row, ratio, min = 0.2) {
  row["Weight(g)"] = Number(Math.max(min, n(row["Weight(g)"]) * ratio).toFixed(1));
}

function retryAdjust(rows, attempt) {
  const a = rows.map((r) => ({ ...r }));

  const proteinLike = a.filter((r) => /えだまめ|ホールコーン|まいたけ|しめじ|しいたけ/.test(r.Ingredient_Name));
  const oils = a.filter((r) => /調合油|ごま油/.test(r.Ingredient_Name));
  const sweet = a.filter((r) => /上白糖|本みりん/.test(r.Ingredient_Name));
  const salted = a.filter((r) => /しょうゆ|食塩|みそ/.test(r.Ingredient_Name));
  const allVeg = a.filter((r) => groupOf(r.Notes) === "vegetable");

  const proteinReduce = [0.82, 0.72, 0.64, 0.56, 0.5][attempt - 1] || 0.5;
  const oilReduce = [0.75, 0.55, 0.4, 0.32, 0.25][attempt - 1] || 0.25;
  const sweetReduce = [0.86, 0.72, 0.6, 0.5, 0.4][attempt - 1] || 0.4;
  const saltReduce = [0.92, 0.85, 0.78, 0.72, 0.65][attempt - 1] || 0.65;
  const vegReduce = [0.95, 0.9, 0.86, 0.82, 0.78][attempt - 1] || 0.78;

  for (const r of proteinLike) scaleW(r, proteinReduce, 1);
  for (const r of oils) scaleW(r, oilReduce, 0.2);
  for (const r of sweet) scaleW(r, sweetReduce, 0.2);
  for (const r of salted) scaleW(r, saltReduce, 0.1);
  for (const r of allVeg) scaleW(r, vegReduce, 8);

  return a;
}

function rowOf(id, it) {
  return {
    Recipe_ID: id,
    Ingredient_Name: it.name,
    "Weight(g)": Number(it.w.toFixed(1)),
    Notes: `${it.g} / ${it.foodName}`,
  };
}

function mkSteps(spec) {
  const lines = [
    "野菜・きのこ類を食べやすい大きさに切る。",
    `${spec.styleLabel}の手順に沿って加熱または和え、調味する。`,
    "主菜化しない量で整え、副菜として盛り付ける。",
  ];
  return lines.map((x, i) => ({ Recipe_ID: spec.id, Step_Number: i + 1, Instruction: x }));
}

function makeSpecs(foods, catalog) {
  const pick = (display) => {
    const food = resolveByDisplay(foods, catalog, display);
    return { name: display, foodName: food.foodName };
  };

  const F = {
    cabbage: pick("キャベツ"),
    komatsuna: pick("こまつな"),
    broccoli: pick("ブロッコリー"),
    onion: pick("たまねぎ"),
    carrot: pick("にんじん"),
    tomato: pick("トマト"),
    shiitake: pick("しいたけ"),
    shimeji: pick("しめじ"),
    maitake: pick("まいたけ"),
    corn: pick("ホールコーン"),
    edamame: pick("えだまめ"),
    nori: pick("あおのり・焼きのり"),
    ginger: pick("しょうが"),
    soy: pick("こいくちしょうゆ"),
    salt: pick("食塩"),
    sugar: pick("上白糖"),
    miso: pick("米みそ"),
    mirin: pick("本みりん"),
    oil: pick("調合油"),
    sesameOil: pick("ごま油"),
  };

  const styles = [
    {
      key: "ohitashi_komatsuna",
      label: "小松菜おひたし",
      method: "茹で",
      build: (i) => [
        { g: "vegetable", ...F.komatsuna, w: 72 + i * 2.2 },
        { g: "vegetable", ...F.carrot, w: 24 + i * 0.9 },
        { g: "vegetable", ...F.nori, w: 0.8 + i * 0.05 },
        { g: "seasoning", ...F.soy, w: 4 + i * 0.12 },
        { g: "seasoning", ...F.mirin, w: 1.2 + i * 0.04 },
      ],
    },
    {
      key: "cabbage_shio",
      label: "キャベツ塩和え",
      method: "茹で",
      build: (i) => [
        { g: "vegetable", ...F.cabbage, w: 85 + i * 2.3 },
        { g: "vegetable", ...F.tomato, w: 28 + i * 1.1 },
        { g: "vegetable", ...F.nori, w: 0.6 + i * 0.04 },
        { g: "seasoning", ...F.salt, w: 0.6 + i * 0.03 },
        { g: "seasoning", ...F.sesameOil, w: 1.6 + i * 0.1 },
      ],
    },
    {
      key: "broccoli_simmer",
      label: "ブロッコリー旨煮",
      method: "煮る",
      build: (i) => [
        { g: "vegetable", ...F.broccoli, w: 82 + i * 2.1 },
        { g: "vegetable", ...F.onion, w: 35 + i * 1.2 },
        { g: "vegetable", ...F.shimeji, w: 18 + i * 0.8 },
        { g: "seasoning", ...F.soy, w: 4 + i * 0.13 },
        { g: "seasoning", ...F.mirin, w: 1.4 + i * 0.05 },
      ],
    },
    {
      key: "kinoko_sote",
      label: "きのこソテー",
      method: "炒め",
      build: (i) => [
        { g: "vegetable", ...F.shiitake, w: 28 + i * 0.9 },
        { g: "vegetable", ...F.shimeji, w: 30 + i * 1.1 },
        { g: "vegetable", ...F.maitake, w: 28 + i * 1.0 },
        { g: "vegetable", ...F.onion, w: 28 + i * 0.9 },
        { g: "seasoning", ...F.oil, w: 2.2 + i * 0.08 },
        { g: "seasoning", ...F.salt, w: 0.7 + i * 0.03 },
      ],
    },
    {
      key: "broccoli_tomato",
      label: "ブロッコリーとトマト和え",
      method: "茹で",
      build: (i) => [
        { g: "vegetable", ...F.broccoli, w: 70 + i * 1.8 },
        { g: "vegetable", ...F.tomato, w: 45 + i * 1.6 },
        { g: "vegetable", ...F.onion, w: 16 + i * 0.7 },
        { g: "seasoning", ...F.soy, w: 3.2 + i * 0.1 },
        { g: "seasoning", ...F.sesameOil, w: 1.8 + i * 0.09 },
      ],
    },
    {
      key: "nimono_carrot_cabbage",
      label: "人参キャベツ煮",
      method: "煮る",
      build: (i) => [
        { g: "vegetable", ...F.carrot, w: 46 + i * 1.5 },
        { g: "vegetable", ...F.cabbage, w: 66 + i * 1.9 },
        { g: "vegetable", ...F.shiitake, w: 16 + i * 0.7 },
        { g: "seasoning", ...F.soy, w: 3.8 + i * 0.12 },
        { g: "seasoning", ...F.sugar, w: 0.9 + i * 0.04 },
      ],
    },
    {
      key: "komatsuna_goma_style",
      label: "小松菜ごま風味",
      method: "炒め",
      build: (i) => [
        { g: "vegetable", ...F.komatsuna, w: 62 + i * 1.9 },
        { g: "vegetable", ...F.carrot, w: 26 + i * 1.0 },
        { g: "vegetable", ...F.corn, w: 14 + i * 0.8 },
        { g: "seasoning", ...F.soy, w: 3.8 + i * 0.12 },
        { g: "seasoning", ...F.sesameOil, w: 1.6 + i * 0.08 },
      ],
    },
    {
      key: "onion_grill",
      label: "玉ねぎ焼きびたし",
      method: "焼き",
      build: (i) => [
        { g: "vegetable", ...F.onion, w: 88 + i * 2.0 },
        { g: "vegetable", ...F.tomato, w: 26 + i * 1.0 },
        { g: "vegetable", ...F.nori, w: 0.8 + i * 0.05 },
        { g: "seasoning", ...F.soy, w: 4.4 + i * 0.13 },
        { g: "seasoning", ...F.oil, w: 1.8 + i * 0.07 },
      ],
    },
    {
      key: "miso_simmer_veg",
      label: "野菜みそ煮",
      method: "煮る",
      build: (i) => [
        { g: "vegetable", ...F.cabbage, w: 66 + i * 1.7 },
        { g: "vegetable", ...F.shimeji, w: 20 + i * 0.8 },
        { g: "vegetable", ...F.carrot, w: 24 + i * 0.9 },
        { g: "seasoning", ...F.miso, w: 4 + i * 0.15 },
        { g: "seasoning", ...F.mirin, w: 1.2 + i * 0.04 },
      ],
    },
    {
      key: "edamame_controlled",
      label: "枝豆入り温野菜",
      method: "茹で",
      build: (i) => [
        { g: "vegetable", ...F.broccoli, w: 60 + i * 1.6 },
        { g: "vegetable", ...F.cabbage, w: 44 + i * 1.4 },
        { g: "vegetable", ...F.edamame, w: 12 + i * 0.6 },
        { g: "vegetable", ...F.tomato, w: 20 + i * 0.8 },
        { g: "seasoning", ...F.salt, w: 0.7 + i * 0.03 },
        { g: "seasoning", ...F.soy, w: 2.8 + i * 0.1 },
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
      if (ing.some((x) => /精白米|ごはん|鶏卵|肉|まぐろ|鮭|鯛|いわし|さば|さわら|たら|かつお/.test(x.name))) {
        throw new Error(`main/protein ingredient found: ${id}`);
      }
      specs.push({
        id,
        styleKey: style.key,
        styleLabel: style.label,
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
  const catalog = readGohanCatalog(GOHAN_DB);
  const { yMap, rMap, yDef, rDef } = readYieldRetention(retPath);
  const { specs } = makeSpecs(foods, catalog);

  const ingredients = [];
  const steps = [];
  const master = [];
  let retryCount = 0;
  let proteinViolationCount = 0;
  let kcalViolationCount = 0;
  let categoryViolationCount = 0;
  let highProteinTagCount = 0;
  const styleCounts = {};

  for (const spec of specs) {
    let rows = spec.ingredients.map((it) => rowOf(spec.id, it));
    let calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);

    if (calc.total.protein >= PROTEIN_LIMIT || calc.total.kcal > KCAL_LIMIT || !calc.categoryUnitOk) {
      for (let a = 1; a <= MAX_RETRY; a += 1) {
        rows = retryAdjust(rows, a).map((r) => ({ ...r, Recipe_ID: spec.id }));
        calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
        if (calc.total.protein < PROTEIN_LIMIT && calc.total.kcal <= KCAL_LIMIT && calc.categoryUnitOk) {
          retryCount += 1;
          break;
        }
      }
    }

    if (calc.total.protein >= PROTEIN_LIMIT) proteinViolationCount += 1;
    if (calc.total.kcal > KCAL_LIMIT) kcalViolationCount += 1;
    if (!calc.categoryUnitOk) categoryViolationCount += 1;
    if (calc.tags.includes("高たんぱく")) highProteinTagCount += 1;

    const pfcE = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const diff = pfcE > 0 ? Math.abs(calc.total.kcal - pfcE) / pfcE : 0;
    if (diff > 0.4) throw new Error(`energy mismatch: ${spec.id}`);

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
      Notes: `Category=副菜（タンパク質控えめ）; Style=${spec.styleLabel}; category_validity=${calc.categoryUnitOk}; protein_limit=${PROTEIN_LIMIT}; Food_Master=${path.basename(
        foodPath
      )}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });
    styleCounts[spec.styleLabel] = (styleCounts[spec.styleLabel] || 0) + 1;
  }

  if (master.length !== TARGET) throw new Error("recipe count mismatch");
  for (let i = 1; i <= TARGET; i += 1) {
    const ex = `${ID_PREFIX}${String(i).padStart(3, "0")}`;
    if (master[i - 1].Recipe_ID !== ex) throw new Error(`id mismatch: ${ex}`);
  }

  for (const r of master) {
    if (Object.values(r).some(hasNA)) throw new Error(`NA in master: ${r.Recipe_ID}`);
    const s = Number((r.P_ratio + r.F_ratio + r.C_ratio).toFixed(1));
    if (Math.abs(s - 100) > 0.4) throw new Error(`pfc ratio fail: ${r.Recipe_ID}`);
    for (const k of [
      "Energy(kcal)",
      "Protein(g)",
      "Fat(g)",
      "Carbohydrate(g)",
      "Calcium(mg)",
      "Iron(mg)",
      "VitaminB1(mg)",
      "VitaminB2(mg)",
      "VitaminB6(mg)",
      "VitaminB12(ug)",
      "VitaminC(mg)",
      "VitaminD(ug)",
      "RetinolEq(ug)",
      "Salt(g)",
      "P_ratio",
      "F_ratio",
      "C_ratio",
    ]) {
      if (!Number.isFinite(r[k])) throw new Error(`numeric fail: ${r.Recipe_ID} ${k}`);
    }
  }
  for (const r of ingredients) if (Object.values(r).some(hasNA)) throw new Error(`NA in ingredients: ${r.Recipe_ID}`);
  for (const r of steps) if (Object.values(r).some(hasNA)) throw new Error(`NA in steps: ${r.Recipe_ID}`);

  const proteins = master.map((r) => n(r["Protein(g)"]));
  const kcals = master.map((r) => n(r["Energy(kcal)"]));
  const fats = master.map((r) => n(r["Fat(g)"]));
  const ingredientCountOk = master.every((m) => {
    const c = ingredients.filter((x) => x.Recipe_ID === m.Recipe_ID).length;
    return c >= 5 && c <= 12;
  });
  const categoryValidity = proteinViolationCount === 0 && categoryViolationCount === 0 && ingredientCountOk;

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
    style_counts: styleCounts,
    retry_adjustment_count: retryCount,
    protein_limit_g: PROTEIN_LIMIT,
    energy_upper_target_kcal: KCAL_LIMIT,
    protein_range_g: {
      min: Number(Math.min(...proteins).toFixed(3)),
      max: Number(Math.max(...proteins).toFixed(3)),
    },
    energy_range_kcal: {
      min: Number(Math.min(...kcals).toFixed(3)),
      max: Number(Math.max(...kcals).toFixed(3)),
    },
    fat_range_g: {
      min: Number(Math.min(...fats).toFixed(3)),
      max: Number(Math.max(...fats).toFixed(3)),
    },
    high_protein_tag_count: highProteinTagCount,
    violation_counts: {
      protein_gte_5: proteinViolationCount,
      kcal_over_limit: kcalViolationCount,
      category_invalid: categoryViolationCount,
    },
    checks: {
      na_zero: true,
      excel_valid: excelValid,
      pfc_consistency: true,
      energy_consistency: true,
      protein_limit_validity: proteinViolationCount === 0,
      lowprotein_category_validity: categoryValidity,
      lowprotein_tag_expected: highProteinTagCount === 0,
      ingredient_count_validity: ingredientCountOk,
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
