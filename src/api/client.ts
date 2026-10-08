import type { z } from "zod";

export class AuthError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    const nested = b.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === "string") return nested.message;
    if (typeof b.message === "string") return b.message;
  }
  return `TravStats answered HTTP ${status}`;
}

/** One call to TravStats through the same-origin /api/v1 proxy. */
export async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: { method?: string; json?: unknown } = {}
): Promise<z.infer<S>> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.json === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
  if (res.status === 401) throw new AuthError();
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status));
  return schema.parse(body);
}
