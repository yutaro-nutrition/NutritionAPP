const JP_PUNCTUATION_REGEX = /[・･、。，．,.・\/\\()（）「」『』\[\]【】{}｛｝:：;；"'`´’‘“”!?！？]/g;
const SPACE_REGEX = /\s+/g;

function toKatakana(input: string): string {
  return input.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

export function normalizeFoodName(input: string): string {
  return toKatakana(input.normalize("NFKC"))
    .toLowerCase()
    .replace(SPACE_REGEX, "")
    .replace(JP_PUNCTUATION_REGEX, "")
    .replace(/ヶ/g, "ケ")
    .replace(/ヵ/g, "カ")
    .trim();
}

export function stripVariantHint(input: string): string {
  return normalizeFoodName(input)
    .replace(/(脂身つき|脂身なし|皮つき|皮なし|生|ゆで|焼き|焼|乾|缶詰|冷凍)/g, "")
    .trim();
}

