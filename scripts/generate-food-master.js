const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const INPUT_XLSX_PATH = path.resolve(process.cwd(), "food_source.xlsx");
const OUTPUT_JSON_PATH = path.resolve(process.cwd(), "src/data/food_master_expanded.json");

const HEADER_ROW_INDEX = 11; // row 12: 成分識別子
const FIRST_DATA_ROW_INDEX = 12; // row 13: 実データ開始

const ID_CODE_TO_APP_CATEGORY = {
  "01": "穀類",
  "02": "野菜類",
  "03": "調味料",
  "04": "豆類",
  "05": "その他",
  "06": "野菜類",
  "07": "果実類",
  "08": "野菜類",
  "09": "その他",
  "10": "魚介類",
  "11": "肉類",
  "12": "卵類",
  "13": "乳類",
  "14": "油脂類",
  "15": "菓子類",
  "16": "その他",
  "17": "調味料",
  "18": "その他"
};

function normalizeFoodName(name) {
  return String(name ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[　]+/g, " ")
    .replace(/\u3000/g, " ")
    .trim();
}

function toNumber(value) {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw || raw === "-" || /^tr$/i.test(raw) || /^\(tr\)$/i.test(raw)) return 0;
  const normalized = raw.replace(/[()]/g, "").replace(/,/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function buildColumnIndexMap(headerRow) {
  const map = {};
  for (let c = 0; c < headerRow.length; c += 1) {
    const token = String(headerRow[c]?.v ?? "").trim();
    if (token) map[token] = c;
  }
  return map;
}

function getCell(row, columnIndexMap, key) {
  const idx = columnIndexMap[key];
  if (idx == null) return "";
  return row[idx]?.v ?? "";
}

function main() {
  if (!fs.existsSync(INPUT_XLSX_PATH)) {
    throw new Error(`Excel file not found: ${INPUT_XLSX_PATH}`);
  }

  const workbook = XLSX.readFile(INPUT_XLSX_PATH, {
    dense: true,
    cellText: true,
    cellDates: false
  });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet["!ref"]) {
    throw new Error("Failed to read the first sheet or sheet range.");
  }

  const headerRow = sheet[HEADER_ROW_INDEX] || [];
  const columnIndexMap = buildColumnIndexMap(headerRow);

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const records = [];
  let sequence = 1;

  for (let r = FIRST_DATA_ROW_INDEX; r <= range.e.r; r += 1) {
    const row = sheet[r] || [];
    const foodNo = normalizeFoodName(row[1]?.v);
    const foodName = normalizeFoodName(getCell(row, columnIndexMap, "成分識別子"));

    if (!foodNo || !foodName) continue;

    const groupCode = normalizeFoodName(row[0]?.v);
    const refuse = toNumber(getCell(row, columnIndexMap, "REFUSE"));
    const edible = refuse >= 0 && refuse <= 100 ? Number((100 - refuse).toFixed(2)) : 100;

    records.push({
      food_id: `f_${String(sequence).padStart(4, "0")}`,
      food_name: foodName,
      food_name_kana: "",
      category: ID_CODE_TO_APP_CATEGORY[groupCode] ?? "その他",
      energy_kcal: toNumber(getCell(row, columnIndexMap, "ENERC_KCAL")),
      protein_g: toNumber(getCell(row, columnIndexMap, "PROT-")),
      fat_g: toNumber(getCell(row, columnIndexMap, "FAT-")),
      carbohydrate_g: toNumber(getCell(row, columnIndexMap, "CHOCDF-")),
      calcium_mg: toNumber(getCell(row, columnIndexMap, "CA")),
      iron_mg: toNumber(getCell(row, columnIndexMap, "FE")),
      vitamin_b1_mg: toNumber(getCell(row, columnIndexMap, "THIA")),
      vitamin_b2_mg: toNumber(getCell(row, columnIndexMap, "RIBF")),
      vitamin_b6_mg: toNumber(getCell(row, columnIndexMap, "VITB6A")),
      vitamin_b12_ug: toNumber(getCell(row, columnIndexMap, "VITB12")),
      vitamin_c_mg: toNumber(getCell(row, columnIndexMap, "VITC")),
      vitamin_d_ug: toNumber(getCell(row, columnIndexMap, "VITD")),
      retinol_activity_equivalent_ug: toNumber(getCell(row, columnIndexMap, "VITA_RAE")),
      salt_equivalent_g: toNumber(getCell(row, columnIndexMap, "NACL_EQ")),
      edible_portion_percent: edible
    });

    sequence += 1;
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(records, null, 2), "utf8");

  console.log(`Generated: ${OUTPUT_JSON_PATH}`);
  console.log(`Records: ${records.length}`);
  console.log("Sample:", records.slice(0, 3));
}

main();
