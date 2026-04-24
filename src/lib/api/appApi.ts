const DEFAULT_APP_API_BASE_URL = "http://127.0.0.1:8000";

export interface AppApiErrorResponse {
  error_code: string;
  detail: unknown;
}

export class AppApiError extends Error {
  status: number;
  payload: AppApiErrorResponse | null;

  constructor(message: string, status: number, payload: AppApiErrorResponse | null = null) {
    super(message);
    this.name = "AppApiError";
    this.status = status;
    this.payload = payload;
  }
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getAppApiBaseUrl = () =>
  trimTrailingSlash(process.env.APP_API_BASE_URL || process.env.NEXT_PUBLIC_APP_API_BASE_URL || DEFAULT_APP_API_BASE_URL);

export const buildAppApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppApiBaseUrl()}${normalizedPath}`;
};

const parseErrorPayload = async (response: Response): Promise<AppApiErrorResponse | null> => {
  try {
    return (await response.json()) as AppApiErrorResponse;
  } catch {
    return null;
  }
};

export const fetchAppApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  const response = await fetch(buildAppApiUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    throw new AppApiError(payload?.error_code ?? `APP_API_${response.status}`, response.status, payload);
  }

  return (await response.json()) as T;
};
