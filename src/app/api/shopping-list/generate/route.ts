import { NextResponse } from "next/server";
import { generateShoppingList } from "@/lib/utils/shoppingList";
import { shoppingListSchema } from "@/lib/utils/schemas";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = shoppingListSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const list = generateShoppingList(parsed.data.recipe_ids);
    return NextResponse.json({ ok: true, shoppingList: list });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
