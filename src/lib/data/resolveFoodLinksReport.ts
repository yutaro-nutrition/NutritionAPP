import type { ResolvedIngredient } from "@/lib/data/resolveFoodLinks";

export interface ResolveSummary {
  total: number;
  resolved: number;
  unresolved: number;
  reviewRequired: number;
  byMatchType: Record<string, number>;
}

export function buildResolveSummary(rows: ResolvedIngredient[]): ResolveSummary {
  const byMatchType: Record<string, number> = {};
  for (const row of rows) {
    byMatchType[row.match_type] = (byMatchType[row.match_type] ?? 0) + 1;
  }

  return {
    total: rows.length,
    resolved: rows.filter((r) => r.match_type !== "unresolved").length,
    unresolved: rows.filter((r) => r.match_type === "unresolved").length,
    reviewRequired: rows.filter((r) => r.review_required).length,
    byMatchType
  };
}

export function extractUnresolved(rows: ResolvedIngredient[]): ResolvedIngredient[] {
  return rows.filter((r) => r.match_type === "unresolved" || r.review_required);
}

