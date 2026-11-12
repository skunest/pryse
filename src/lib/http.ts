import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (m: string) => new ApiError(400, m, "bad_request");
export const unauthorized = (m = "Sign in required") => new ApiError(401, m, "unauthorized");
export const forbidden = (m = "You do not have permission to do this") => new ApiError(403, m, "forbidden");
export const notFound = (m = "Not found") => new ApiError(404, m, "not_found");

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turns thrown errors (ApiError, Zod, Postgres) into clean JSON responses. */
export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const msg = first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input";
    return json({ error: { code: "validation", message: msg, issues: err.issues } }, 400);
  }
  // Postgres errors raised by our triggers and functions (code P0001) carry
  // user-facing messages. Anything else is logged and hidden.
  const pg = err as { code?: string; message?: string };
  if (pg && pg.code === "P0001" && pg.message) {
    return json({ error: { code: "rule", message: pg.message } }, 422);
  }
  if (pg && pg.code === "23505") {
    return json({ error: { code: "duplicate", message: "That record already exists" } }, 409);
  }
  if (pg && pg.code === "42501") {
    return json({ error: { code: "forbidden", message: "You do not have permission to do this" } }, 403);
  }
  console.error("[pryse]", err);
  return json({ error: { code: "server_error", message: "Something went wrong" } }, 500);
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with error handling. */
export function route<P = Record<string, string>>(
  fn: (req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, params);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Throws the Supabase error if present, otherwise returns data. */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function body<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Request body must be JSON");
  }
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
}

export function userAgent(req: Request) {
  return (req.headers.get("user-agent") || "").slice(0, 300) || null;
}
