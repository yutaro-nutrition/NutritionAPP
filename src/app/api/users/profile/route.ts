import { NextResponse } from "next/server";
import { profileSchema } from "@/lib/utils/schemas";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: parsed.data });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
