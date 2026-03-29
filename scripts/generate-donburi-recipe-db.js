const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = process.cwd();
const FOOD_CANDS = [
  'C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx',
  path.resolve(ROOT, 'Food_Master_Japan2023_IndexBased.xlsx'),
  path.resolve(ROOT, 'source_japan2023.xlsx'),
  path.resolve(ROOT, 'food_source.xlsx'),
];
const RET_CANDS = [
  'C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx',
  path.resolve(ROOT, 'Retention_Table_Design_Japan2023.xlsx'),
];
const GOHAN_DB = path.resolve(ROOT, 'recipe_db_gohan_120.xlsx');
const OUT_XLSX = path.resolve(ROOT, 'recipe_db_donburi_100_batch1.xlsx');
const OUT_REPORT = path.resolve(ROOT, 'donburi_generation_report_batch1.json');
const TARGET = 100;
const MAX_RETRY = 3;

const NKEYS = [
  'kcal', 'protein', 'fat', 'carb', 'calcium', 'iron', 'vitaminB1', 'vitaminB2', 'vitaminB6', 'vitaminB12', 'vitaminC', 'vitaminD', 'rae', 'salt',
];

const METHOD_TO_PROFILE = { 茹で: 'boil', 炒め: 'stirFry', 煮る: 'simmer', 焼き: 'grill' };
const METHOD_TO_PROCESS = { 茹で: 'BOIL', 炒め: 'SAUTE', 煮る: 'SIMMER', 焼き: 'GRILL' };

const n = (v) => {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || /^tr$/i.test(s) || /^\(tr\)$/i.test(s)) return 0;
  const x = Number(s.replace(/,/g, '').replace(/[()]/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const norm = (v) =>
  String(v || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・･()（）\[\]{}\-_,.]/g, '');
const hasNA = (v) => typeof v === 'string' && /#N\/A|#REF!|#VALUE!/i.test(v);
const empty = () => ({ kcal: 0, protein: 0, fat: 0, carb: 0, calcium: 0, iron: 0, vitaminB1: 0, vitaminB2: 0, vitaminB6: 0, vitaminB12: 0, vitaminC: 0, vitaminD: 0, rae: 0, salt: 0 });
const sumN = (arr) => arr.reduce((a, b) => { for (const k of NKEYS) a[k] += b[k] || 0; return a; }, empty());
const roundN = (x) => { const o = { ...x }; for (const k of NKEYS) o[k] = Number((o[k] || 0).toFixed(3)); return o; };

const pickFile = (cands, label) => {
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error(`missing ${label}: ${cands.join(' / ')}`);
};

function readFoods(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const ws = wb.Sheets.Food_Master_Numeric || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const foods = rows
    .map((r) => ({
      foodNo: String(r.Food_No || r['食品番号'] || '').trim().replace(/^0+/, ''),
      foodName: String(r.Food_Name || r['食品名'] || '').trim(),
      refusePercent: n(r.REFUSE || r['廃棄率']),
      kcal: n(r.ENERC_KCAL),
      protein: n(r['PROT-']),
      fat: n(r['FAT-']),
      carb: n(r['CHOCDF-']),
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
  if (!foods.length) throw new Error('food master empty');
  return foods;
}

function readYieldRetention(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const y = wb.Sheets.Yield_Table;
  const r = wb.Sheets.Retention_Table;
  if (!y || !r) throw new Error('Yield_Table / Retention_Table missing');

  const yRows = XLSX.utils.sheet_to_json(y, { defval: '' });
  const rRows = XLSX.utils.sheet_to_json(r, { defval: '' });

  const yMap = new Map();
  for (const row of yRows) {
    const fid = String(row.Food_ID || '').trim().replace(/^0+/, '');
    const p = String(row.Process || '').trim().toUpperCase();
    const rate = n(row.Yield_Rate);
    if (fid && p && rate > 0) yMap.set(`${fid}|${p}`, rate);
  }

  const map = {
    Energy: 'kcal', Protein: 'protein', Fat: 'fat', Carbohydrate: 'carb',
    Calcium: 'calcium', Iron: 'iron', Vitamin_B1: 'vitaminB1', Vitamin_B2: 'vitaminB2',
    Vitamin_B6: 'vitaminB6', Vitamin_B12: 'vitaminB12', Vitamin_C: 'vitaminC', Vitamin_D: 'vitaminD',
    'Retinol Activity Equivalents': 'rae', solt: 'salt', Salt: 'salt',
  };

  const rMap = new Map();
  for (const row of rRows) {
    const fid = String(row.Food_ID || '').trim().replace(/^0+/, '');
    const p = String(row.Process || '').trim().toUpperCase();
    const key = map[String(row.Nutrient || '').trim()];
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

  const yDef = { main: 1, protein: 1, vegetable: 1, seasoning: 1 };
  const one = { ...empty(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 };
  const rDef = { boil: one, stirFry: one, simmer: one, grill: one };
  return { yMap, rMap, yDef, rDef };
}

function verifyReferenceDb(file) {
  if (!fs.existsSync(file)) throw new Error(`required file missing: ${file}`);
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  for (const s of ['Ingredients', 'Steps', 'Recipe_Master']) {
    if (!wb.SheetNames.includes(s)) throw new Error(`invalid reference db (missing ${s}): ${file}`);
  }
}

function readGohanCatalog(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Ingredients, { defval: '' });
  const m = new Map();
  for (const r of rows) {
    const d = String(r.Ingredient_Display || '').trim();
    const foodName = String(r.Food_Name || '').trim();
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
  if (total.protein >= 20) t.push('高たんぱく');
  if (total.fat < 10) t.push('低脂質');
  if (total.carb >= 70) t.push('高炭水化物');
  if (total.fat < 10 && digestible && !hasIrritant) t.push('試合前');
  if (total.protein >= 20 && total.carb >= 70) t.push('試合後');
  if (total.kcal >= 650 || total.fat >= 20) t.push('増量期');
  if (total.protein >= 20 && total.fat < 10) t.push('減量期');
  return [...new Set(t)];
}

function groupOf(notes) {
  const g = String(notes).split('/')[0].trim();
  return ['main', 'protein', 'vegetable', 'seasoning'].includes(g) ? g : 'vegetable';
}

function parseFoodName(notes) {
  return String(notes).split('/').slice(-1)[0].trim();
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
  const pc = METHOD_TO_PROCESS[spec.method] || 'RAW';
  if (!m) throw new Error(`unknown method: ${spec.id} ${spec.method}`);

  const calcRows = [];
  for (const row of rows) {
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row['Weight(g)']) || hasNA(row.Notes)) {
      throw new Error(`NA in ingredients: ${spec.id}`);
    }
    const w = n(row['Weight(g)']);
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

  const text = rows.map((r) => `${r.Ingredient_Name} ${r.Notes}`).join(' ');
  const hasIrritant = /にんにく|ラー油|唐辛子|こしょう|キムチ/.test(text);
  const digestible = spec.method === '茹で' || spec.method === '煮る';
  const tags = tagsFrom(total, digestible, hasIrritant);

  const stapleOk = rows.some((r) => groupOf(r.Notes) === 'main' && /米|こめ|精白米/.test(`${r.Ingredient_Name} ${r.Notes}`));
  const mainDishOk = rows.some((r) => groupOf(r.Notes) === 'protein');
  const categoryUnitOk = stapleOk && mainDishOk;

  return { total, pRatio, fRatio, cRatio, tags, categoryUnitOk };
}

function scaleW(row, ratio, min = 0.2) {
  row['Weight(g)'] = Number(Math.max(min, n(row['Weight(g)']) * ratio).toFixed(1));
}

function clampMainRiceWeight(rows, minW = 75, maxW = 100) {
  for (const r of rows) {
    if (groupOf(r.Notes) !== 'main') continue;
    const w = n(r['Weight(g)']);
    r['Weight(g)'] = Number(Math.max(minW, Math.min(maxW, w)).toFixed(1));
  }
}

function retryAdjust(rows, target, attempt, leanFoodName) {
  const a = rows.map((r) => ({ ...r }));
  const needP = target.some((t) => ['高たんぱく', '試合後', '減量期'].includes(t));
  const needF = target.some((t) => ['低脂質', '試合前', '減量期'].includes(t));
  const needC = target.some((t) => ['高炭水化物', '試合後'].includes(t));
  const needB = target.includes('増量期');

  const prs = a.filter((r) => groupOf(r.Notes) === 'protein');
  const mains = a.filter((r) => groupOf(r.Notes) === 'main');
  const fats = a.filter((r) => /調合油|ごま油|肩ロース|皮あり|バター/.test(`${r.Ingredient_Name} ${r.Notes}`));

  const pS = [1.16, 1.3, 1.45][attempt - 1] || 1.45;
  const cS = [1.06, 1.12, 1.18][attempt - 1] || 1.18;
  const fR = [0.78, 0.62, 0.48][attempt - 1] || 0.48;
  const bS = [1.12, 1.22, 1.32][attempt - 1] || 1.32;

  if (needP) for (const r of prs) scaleW(r, pS, 15);
  if (needC) for (const r of mains) scaleW(r, cS, 75);
  if (needB) for (const r of [...mains, ...prs]) scaleW(r, bS, 10);
  if (needF) for (const r of fats) scaleW(r, fR, 0.1);

  if (needF && attempt >= 2) {
    for (const r of a) {
      if (groupOf(r.Notes) === 'protein' && /肩ロース|皮あり/.test(r.Ingredient_Name)) {
        r.Ingredient_Name = '鶏むね肉（皮なし）';
        r.Notes = `protein / ${leanFoodName}`;
      }
    }
  }
  clampMainRiceWeight(a, 75, 100);
  return a;
}

function rowOf(id, it) {
  return {
    Recipe_ID: id,
    Ingredient_Name: it.name,
    'Weight(g)': Number(it.w.toFixed(1)),
    Notes: `${it.g} / ${it.foodName}`,
  };
}

function mkSteps(spec) {
  const lines = [
    'ごはんをどんぶりに盛る。',
    `${spec.styleLabel}用の主菜を加熱して味を調える。`,
    '主菜をごはんにのせ、野菜と調味料で仕上げる。',
    '主食と主菜が一体になった一品完結の丼として提供する。',
  ];
  return lines.map((x, i) => ({ Recipe_ID: spec.id, Step_Number: i + 1, Instruction: x }));
}

function makeSpecs(foods, catalog) {
  const pick = (display) => {
    const food = resolveByDisplay(foods, catalog, display);
    return { name: display, foodName: food.foodName };
  };

  const F = {
    rice: pick('精白米'),
    beefLean: pick('牛もも肉'),
    beefFat: pick('牛肩ロース'),
    porkLean: pick('豚もも肉'),
    porkFat: pick('豚肩ロース'),
    chickenBreast: pick('鶏むね肉（皮なし）'),
    chickenThigh: pick('鶏もも肉（皮なし）'),
    chickenMince: pick('鶏ひき肉'),
    porkMince: pick('豚ひき肉'),
    tuna: pick('まぐろ'),
    salmon: pick('鮭'),
    madai: pick('鯛'),
    egg: pick('鶏卵'),
    onion: pick('たまねぎ'),
    carrot: pick('にんじん'),
    komatsuna: pick('こまつな'),
    cabbage: pick('キャベツ'),
    shiitake: pick('しいたけ'),
    shimeji: pick('しめじ'),
    soy: pick('こいくちしょうゆ'),
    mirin: pick('本みりん'),
    sake: pick('清酒'),
    salt: pick('食塩'),
    sugar: pick('上白糖'),
    oil: pick('調合油'),
    sesameOil: pick('ごま油'),
    miso: pick('米みそ'),
    garlic: pick('にんにく'),
  };

  const styles = [
    { key: 'oyakodon', label: '親子丼', method: '煮る', target: ['高たんぱく', '高炭水化物'], build: (i) => [
      { g: 'main', ...F.rice, w: 82 + (i % 4) * 2 },
      { g: 'protein', ...F.chickenThigh, w: 70 + i * 2 },
      { g: 'protein', ...F.egg, w: 48 + i * 1.5 },
      { g: 'vegetable', ...F.onion, w: 38 + i * 1.5 },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.mirin, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.sake, w: 7 + i * 0.2 },
    ] },
    { key: 'gyudon', label: '牛丼', method: '煮る', target: ['高炭水化物', '増量期'], build: (i) => [
      { g: 'main', ...F.rice, w: 84 + (i % 3) * 2 },
      { g: 'protein', ...F.beefFat, w: 72 + i * 2.2 },
      { g: 'vegetable', ...F.onion, w: 50 + i * 2 },
      { g: 'seasoning', ...F.soy, w: 9 + i * 0.2 },
      { g: 'seasoning', ...F.mirin, w: 9 + i * 0.2 },
      { g: 'seasoning', ...F.sugar, w: 3.5 + i * 0.2 },
    ] },
    { key: 'butadon', label: '豚丼', method: '炒め', target: ['高炭水化物', '高たんぱく'], build: (i) => [
      { g: 'main', ...F.rice, w: 83 + (i % 3) * 2 },
      { g: 'protein', ...F.porkLean, w: 74 + i * 2 },
      { g: 'vegetable', ...F.onion, w: 42 + i * 1.5 },
      { g: 'vegetable', ...F.carrot, w: 20 + i },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.mirin, w: 7 + i * 0.2 },
      { g: 'seasoning', ...F.oil, w: 2.8 + i * 0.1 },
    ] },
    { key: 'torisoboro', label: '鶏そぼろ丼', method: '炒め', target: ['高たんぱく', '高炭水化物', '試合後'], build: (i) => [
      { g: 'main', ...F.rice, w: 82 + (i % 4) * 2 },
      { g: 'protein', ...F.chickenMince, w: 70 + i * 2 },
      { g: 'protein', ...F.egg, w: 35 + i * 1.2 },
      { g: 'vegetable', ...F.komatsuna, w: 24 + i * 1.2 },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.sugar, w: 3 + i * 0.2 },
    ] },
    { key: 'kaisendon', label: '海鮮丼', method: '茹で', target: ['高たんぱく', '高炭水化物', '低脂質'], build: (i) => [
      { g: 'main', ...F.rice, w: 81 + (i % 4) * 2 },
      { g: 'protein', ...F.tuna, w: 38 + i * 1.3 },
      { g: 'protein', ...F.salmon, w: 24 + i * 1.1 },
      { g: 'protein', ...F.madai, w: 24 + i * 1.1 },
      { g: 'vegetable', ...F.komatsuna, w: 12 + i * 0.8 },
      { g: 'seasoning', ...F.soy, w: 7 + i * 0.2 },
    ] },
    { key: 'sanshokudon', label: '三色丼', method: '炒め', target: ['高たんぱく', '高炭水化物'], build: (i) => [
      { g: 'main', ...F.rice, w: 82 + (i % 4) * 2 },
      { g: 'protein', ...F.chickenMince, w: 62 + i * 1.8 },
      { g: 'protein', ...F.egg, w: 42 + i * 1.3 },
      { g: 'vegetable', ...F.komatsuna, w: 32 + i * 1.2 },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.sugar, w: 2.8 + i * 0.15 },
    ] },
    { key: 'chukadon', label: '中華丼', method: '炒め', target: ['高炭水化物', '高たんぱく'], build: (i) => [
      { g: 'main', ...F.rice, w: 84 + (i % 3) * 2 },
      { g: 'protein', ...F.porkLean, w: 56 + i * 1.8 },
      { g: 'protein', ...F.chickenThigh, w: 30 + i * 1.2 },
      { g: 'vegetable', ...F.cabbage, w: 42 + i * 1.8 },
      { g: 'vegetable', ...F.carrot, w: 22 + i },
      { g: 'vegetable', ...F.shiitake, w: 20 + i },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.oil, w: 3 + i * 0.1 },
    ] },
    { key: 'katsudonfuu', label: 'カツ丼風', method: '煮る', target: ['高炭水化物', '増量期'], build: (i) => [
      { g: 'main', ...F.rice, w: 84 + (i % 4) * 2 },
      { g: 'protein', ...F.porkFat, w: 72 + i * 2.1 },
      { g: 'protein', ...F.egg, w: 46 + i * 1.4 },
      { g: 'vegetable', ...F.onion, w: 44 + i * 1.8 },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.mirin, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.sugar, w: 3 + i * 0.15 },
    ] },
    { key: 'mapodonfuu', label: '麻婆丼風', method: '煮る', target: ['高炭水化物', '高たんぱく', '増量期'], build: (i) => [
      { g: 'main', ...F.rice, w: 83 + (i % 4) * 2 },
      { g: 'protein', ...F.porkMince, w: 66 + i * 2 },
      { g: 'protein', ...F.chickenMince, w: 30 + i * 1.2 },
      { g: 'vegetable', ...F.onion, w: 38 + i * 1.5 },
      { g: 'seasoning', ...F.miso, w: 10 + i * 0.3 },
      { g: 'seasoning', ...F.soy, w: 7 + i * 0.2 },
      { g: 'seasoning', ...F.sesameOil, w: 3.2 + i * 0.12 },
      { g: 'seasoning', ...F.garlic, w: 2.2 + i * 0.12 },
    ] },
    { key: 'teriyaki', label: '照り焼き鶏丼', method: '焼き', target: ['高たんぱく', '高炭水化物'], build: (i) => [
      { g: 'main', ...F.rice, w: 82 + (i % 4) * 2 },
      { g: 'protein', ...F.chickenThigh, w: 74 + i * 2 },
      { g: 'vegetable', ...F.onion, w: 34 + i * 1.3 },
      { g: 'vegetable', ...F.shimeji, w: 24 + i * 1.2 },
      { g: 'seasoning', ...F.soy, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.mirin, w: 8 + i * 0.2 },
      { g: 'seasoning', ...F.sake, w: 7 + i * 0.2 },
      { g: 'seasoning', ...F.sugar, w: 2.6 + i * 0.12 },
    ] },
  ];

  const specs = [];
  let idn = 1;
  for (const style of styles) {
    for (let i = 0; i < 10; i += 1) {
      const id = `DON_${String(idn).padStart(3, '0')}`;
      const ing = style.build(i);
      if (ing.length < 5 || ing.length > 12) throw new Error(`ingredient count invalid: ${id}`);
      if (!ing.some((x) => x.g === 'main')) throw new Error(`main missing: ${id}`);
      if (!ing.some((x) => x.g === 'protein')) throw new Error(`protein missing: ${id}`);
      specs.push({ id, styleKey: style.key, styleLabel: style.label, name: `${style.label}${i + 1}`, method: style.method, targetTags: [...style.target], ingredients: ing });
      idn += 1;
    }
  }
  if (specs.length !== TARGET) throw new Error(`spec count mismatch: ${specs.length}`);

  const leanFoodName = F.chickenBreast.foodName;
  return { specs, leanFoodName };
}

function main() {
  const foodPath = pickFile(FOOD_CANDS, 'food_master');
  const retPath = pickFile(RET_CANDS, 'yield_retention');
  verifyReferenceDb(GOHAN_DB);

  const foods = readFoods(foodPath);
  const catalog = readGohanCatalog(GOHAN_DB);
  const { yMap, rMap, yDef, rDef } = readYieldRetention(retPath);
  const { specs, leanFoodName } = makeSpecs(foods, catalog);

  const ingredients = [];
  const steps = [];
  const master = [];
  let mismatch = 0;
  let retryCount = 0;
  const styleCounts = {};
  const riceWeights = [];
  let fattyCount = 0;

  for (const spec of specs) {
    let rows = spec.ingredients.map((it) => rowOf(spec.id, it));
    let calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
    let okTag = spec.targetTags.every((t) => calc.tags.includes(t));

    if (!okTag) {
      for (let a = 1; a <= MAX_RETRY; a += 1) {
        rows = retryAdjust(rows, spec.targetTags, a, leanFoodName).map((r) => ({ ...r, Recipe_ID: spec.id }));
        calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
        if (spec.targetTags.every((t) => calc.tags.includes(t))) {
          okTag = true;
          retryCount += 1;
          break;
        }
      }
    }
    if (!okTag) mismatch += 1;

    const pfcE = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const diff = pfcE > 0 ? Math.abs(calc.total.kcal - pfcE) / pfcE : 0;
    if (diff > 0.35) throw new Error(`energy mismatch: ${spec.id}`);
    if (!calc.categoryUnitOk) throw new Error(`主食＋主菜成立NG: ${spec.id}`);

    const rice = rows.find((r) => groupOf(r.Notes) === 'main');
    if (!rice) throw new Error(`rice row missing: ${spec.id}`);
    riceWeights.push(n(rice['Weight(g)']));
    if (calc.total.fat >= 20) fattyCount += 1;

    ingredients.push(...rows);
    steps.push(...mkSteps(spec));
    master.push({
      Recipe_ID: spec.id,
      Recipe_Name: spec.name,
      'Energy(kcal)': calc.total.kcal,
      'Protein(g)': calc.total.protein,
      'Fat(g)': calc.total.fat,
      'Carbohydrate(g)': calc.total.carb,
      P_ratio: calc.pRatio,
      F_ratio: calc.fRatio,
      C_ratio: calc.cRatio,
      Tag: calc.tags.join(', '),
      Cooking_Method: spec.method,
      Notes: `DonburiType=${spec.styleLabel}; 主食＋主菜成立=${calc.categoryUnitOk}; Food_Master=${path.basename(foodPath)}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });

    styleCounts[spec.styleLabel] = (styleCounts[spec.styleLabel] || 0) + 1;
  }

  if (master.length !== TARGET) throw new Error('recipe count mismatch');
  for (let i = 1; i <= TARGET; i += 1) {
    const ex = `DON_${String(i).padStart(3, '0')}`;
    if (master[i - 1].Recipe_ID !== ex) throw new Error(`id mismatch: ${ex}`);
  }

  for (const r of master) {
    if (Object.values(r).some(hasNA)) throw new Error(`NA in master: ${r.Recipe_ID}`);
    const s = Number((r.P_ratio + r.F_ratio + r.C_ratio).toFixed(1));
    if (Math.abs(s - 100) > 0.3) throw new Error(`pfc ratio fail: ${r.Recipe_ID}`);
    for (const k of ['Energy(kcal)', 'Protein(g)', 'Fat(g)', 'Carbohydrate(g)', 'P_ratio', 'F_ratio', 'C_ratio']) {
      if (!Number.isFinite(r[k])) throw new Error(`numeric fail: ${r.Recipe_ID}`);
    }
  }
  for (const r of ingredients) if (Object.values(r).some(hasNA)) throw new Error(`NA in ingredients: ${r.Recipe_ID}`);
  for (const r of steps) if (Object.values(r).some(hasNA)) throw new Error(`NA in steps: ${r.Recipe_ID}`);

  const riceMin = Math.min(...riceWeights);
  const riceMax = Math.max(...riceWeights);
  const riceSpreadOk = riceMin >= 75 && riceMax <= 100 && (riceMax - riceMin) <= 25;
  const requiredTypes = ['親子丼', '牛丼', '豚丼', '鶏そぼろ丼', '海鮮丼', '三色丼', '中華丼', 'カツ丼風', '麻婆丼風'];
  const typeDistributionOk = requiredTypes.every((k) => Object.keys(styleCounts).includes(k));
  const stapleMainDishOk = master.every((r) => /主食＋主菜成立=true/.test(String(r.Notes)));
  const highFatBiasOk = fattyCount <= 35;
  const categoryValidity = typeDistributionOk && stapleMainDishOk && riceSpreadOk && highFatBiasOk;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredients), 'Ingredients');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(steps), 'Steps');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master), 'Recipe_Master');
  XLSX.writeFile(wb, OUT_XLSX);

  const v = XLSX.readFile(OUT_XLSX, { cellText: true, cellDates: false });
  const excelValid = v.SheetNames.length === 3 && ['Ingredients', 'Steps', 'Recipe_Master'].every((s) => v.SheetNames.includes(s));
  if (!excelValid) throw new Error('xlsx structure invalid');

  const nutritionMissingZero = master.every((r) => ['Energy(kcal)', 'Protein(g)', 'Fat(g)', 'Carbohydrate(g)'].every((k) => Number.isFinite(r[k])));

  const report = {
    recipe_count: master.length,
    ingredient_rows: ingredients.length,
    step_rows: steps.length,
    tag_mismatch_count: mismatch,
    retry_adjustment_count: retryCount,
    category_validity: categoryValidity,
    style_counts: styleCounts,
    rice_weight_range_g: { min: riceMin, max: riceMax },
    high_fat_recipe_count: fattyCount,
    checks: {
      na_zero: true,
      nutrition_missing_zero: nutritionMissingZero,
      tag_consistency: mismatch === 0,
      excel_valid: excelValid,
      pfc_consistency: true,
      energy_consistency: true,
      staple_plus_main_dish_validity: stapleMainDishOk,
      rice_weight_consistency: riceSpreadOk,
      high_fat_bias_avoided: highFatBiasOk,
      type_distribution_validity: typeDistributionOk,
    },
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (e) {
  console.error(JSON.stringify({ status: 'failed', reason: e && e.message ? e.message : String(e), stopped_at: new Date().toISOString() }, null, 2));
  process.exit(1);
}
