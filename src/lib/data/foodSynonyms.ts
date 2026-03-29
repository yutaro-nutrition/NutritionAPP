import { normalizeFoodName } from "@/lib/data/foodNameNormalizer";

export const FOOD_SYNONYMS: Record<string, string[]> = {
  たまねぎ: ["玉ねぎ", "玉葱", "たまねぎ", "タマネギ"],
  しょうゆ: ["しょう油", "醤油", "しょうゆ", "濃口しょうゆ"],
  みりん: ["本みりん", "みりん", "味醂"],
  りょうりしゅ: ["料理酒", "酒", "清酒"],
  うすりきこ: ["薄力粉", "小麦粉", "こむぎこ"],
  じょうはくとう: ["砂糖", "上白糖", "さとう"],
  ぎゅうにゅう: ["牛乳", "普通牛乳"],
  ごはん: ["白ごはん", "ごはん", "米飯", "白飯"],
  うどん: ["うどん", "ゆでうどん"],
  ぱすた: ["パスタ", "スパゲッティ"],
  つな: ["ツナ", "ツナ缶", "まぐろ缶"],
  とりももにく: ["鶏もも肉", "鶏モモ肉"],
  とりむねにく: ["鶏むね肉", "鶏ムネ肉", "鶏胸肉"],
  ぶたろーすにく: ["豚ロース", "豚ロース肉"],
  ぎゅうももにく: ["牛もも肉", "牛モモ肉"],
  さけ: ["鮭", "さけ", "白鮭", "銀鮭"],
  さば: ["さば", "鯖", "真さば", "ごまさば"],
  まぐろ: ["まぐろ", "鮪"]
};

const aliasToCanonical = new Map<string, string>();

for (const [canonical, aliases] of Object.entries(FOOD_SYNONYMS)) {
  aliasToCanonical.set(normalizeFoodName(canonical), canonical);
  for (const alias of aliases) {
    aliasToCanonical.set(normalizeFoodName(alias), canonical);
  }
}

export function resolveCanonicalFoodTerm(name: string): string | null {
  return aliasToCanonical.get(normalizeFoodName(name)) ?? null;
}

