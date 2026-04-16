import { NextResponse } from "next/server";
import { AppApiError, fetchAppApi } from "@/lib/api/appApi";
import { AppApiMenuResponse } from "@/types/api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = await fetchAppApi<AppApiMenuResponse>("/menu/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AppApiError) {
      return NextResponse.json(
        error.payload ?? { error_code: error.message, detail: "Menu generation request failed." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error_code: "APP_API_UNAVAILABLE",
        detail: error instanceof Error ? error.message : "Menu generation request failed.",
      },
      { status: 502 },
    );
  }
}
