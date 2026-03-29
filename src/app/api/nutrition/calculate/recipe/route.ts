import { NextResponse } from "next/server";
import { calculateRecipeNutrition } from "@/lib/nutrition/recipe";
import { calculateRecipeSchema } from "@/lib/utils/schemas";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = calculateRecipeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const nutrition = calculateRecipeNutrition(parsed.data.recipe_id);
    return NextResponse.json({ ok: true, nutrition });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
