import { NextResponse } from "next/server";
import { getRecipeMaster } from "@/lib/data/loaders";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category")?.trim();
  const maxCookTime = searchParams.get("maxCookTime");
  const maxBudget = searchParams.get("maxBudget");
  const keyword = searchParams.get("keyword")?.trim().toLowerCase();

  let recipes = getRecipeMaster();

  if (category) recipes = recipes.filter((r) => r.category === category);
  if (maxCookTime) recipes = recipes.filter((r) => r.cook_time_min <= Number(maxCookTime));
  if (maxBudget) recipes = recipes.filter((r) => r.budget_jpy <= Number(maxBudget));
  if (keyword) {
    recipes = recipes.filter((r) => `${r.recipe_name} ${r.main_food} ${(r.tags ?? []).join(" ")}`.toLowerCase().includes(keyword));
  }

  return NextResponse.json({ ok: true, recipes });
}
