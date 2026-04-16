import { NextResponse } from "next/server";
import { AppApiError, fetchAppApi } from "@/lib/api/appApi";
import { AppApiRecipeDetail } from "@/types/api";

export async function GET(_: Request, context: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await context.params;

  try {
    const payload = await fetchAppApi<AppApiRecipeDetail>(`/recipes/${encodeURIComponent(recipeId)}`);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AppApiError) {
      return NextResponse.json(
        error.payload ?? { error_code: error.message, detail: "Recipe detail request failed." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error_code: "APP_API_UNAVAILABLE",
        detail: error instanceof Error ? error.message : "Recipe detail request failed.",
      },
      { status: 502 },
    );
  }
}
