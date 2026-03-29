import { NextResponse } from "next/server";
import { generateWeeklyPlan } from "@/lib/scoring/generateWeeklyPlan";
import { DEFAULT_WEEK_DAY_TYPES } from "@/lib/utils/defaults";
import { generateDailyPlanSchema } from "@/lib/utils/schemas";
import { DayPlanType } from "@/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = generateDailyPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const dayTypes = (parsed.data.week_day_types ?? [...DEFAULT_WEEK_DAY_TYPES]) as DayPlanType[];
    const { weekPlans, weekShoppingList } = generateWeeklyPlan(parsed.data.profile, dayTypes);
    const firstDay = weekPlans[0];

    return NextResponse.json({
      ok: true,
      plan: firstDay.plan,
      targets: firstDay.targets,
      evaluation: firstDay.evaluation,
      shoppingList: weekShoppingList,
      weekPlans,
      weekShoppingList,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Generation failed",
      },
      { status: 400 },
    );
  }
}
