import { NextResponse } from "next/server";
import { evaluateNutrition } from "@/lib/nutrition/evaluate";
import { evaluateNutritionSchema } from "@/lib/utils/schemas";
import { NutrientMap } from "@/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = evaluateNutritionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const result = evaluateNutrition(parsed.data.dailyNutrition as NutrientMap, parsed.data.targets as NutrientMap);
    return NextResponse.json({ ok: true, evaluation: result });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
