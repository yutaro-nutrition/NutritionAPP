import { NextResponse } from "next/server";
import { AppApiError, buildAppApiUrl, fetchAppApi } from "@/lib/api/appApi";
import { AppApiRecipeListResponse } from "@/types/api";

const passThroughParams = (requestUrl: string) => {
  const url = new URL(requestUrl);
  const nextUrl = new URL(buildAppApiUrl("/recipes"));

  for (const [key, value] of url.searchParams.entries()) {
    if (value.trim()) {
      nextUrl.searchParams.set(key, value);
    }
  }

  return nextUrl.pathname + nextUrl.search;
};

export async function GET(request: Request) {
  try {
    const payload = await fetchAppApi<AppApiRecipeListResponse>(passThroughParams(request.url));
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AppApiError) {
      return NextResponse.json(
        error.payload ?? { error_code: error.message, detail: "Recipe API request failed." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error_code: "APP_API_UNAVAILABLE",
        detail: error instanceof Error ? error.message : "Recipe API request failed.",
      },
      { status: 502 },
    );
  }
}
