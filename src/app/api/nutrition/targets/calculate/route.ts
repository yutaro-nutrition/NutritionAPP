import { NextResponse } from "next/server";
import { calculateNutritionTargets } from "@/lib/nutrition/targets";
import { profileSchema } from "@/lib/utils/schemas";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const targets = calculateNutritionTargets(parsed.data);
    return NextResponse.json({ ok: true, targets });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
