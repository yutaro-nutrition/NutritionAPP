import { NextResponse } from "next/server";
import { AppApiError, fetchAppApi } from "@/lib/api/appApi";

export async function GET() {
  try {
    const payload = await fetchAppApi("/meta/options");
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AppApiError) {
      return NextResponse.json(
        error.payload ?? { error_code: error.message, detail: "Meta options request failed." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error_code: "APP_API_UNAVAILABLE",
        detail: error instanceof Error ? error.message : "Meta options request failed.",
      },
      { status: 502 },
    );
  }
}
