/**
 * Server Action result contract for TLKV.
 *
 * Never `throw` business/RPC failures from `"use server"` mutations called by the
 * client. In production Next/React maps those throws to Minified React error #441
 * and hides the real Postgres/RPC message.
 *
 * Prefer: return ActionResult / fail / runAction, then show formatActionError in UI.
 */

export type ActionOk<T> = { ok: true; data: T };
export type ActionFail = { ok: false; message: string };
export type ActionResult<T> = ActionOk<T> | ActionFail;

const DIGEST_RE =
  /Minified React error #441|Server Components render|digest property|use the non-minified/i;

/** True when the string is a production digest wrapper, not the real cause. */
export function isOpaqueServerActionError(message: string | null | undefined): boolean {
  return DIGEST_RE.test(String(message || ""));
}

/**
 * Normalize any unknown failure into a staff-facing Vietnamese message.
 * Strips React #441 digests so the UI never shows that URL blob.
 */
export function formatActionError(
  err: unknown,
  fallback = "Không thực hiện được thao tác. Thử lại hoặc kiểm tra trạng thái phiếu.",
): string {
  let raw = "";
  if (typeof err === "string") raw = err;
  else if (err instanceof Error) raw = err.message;
  else if (err && typeof err === "object" && "message" in err) {
    raw = String((err as { message: unknown }).message ?? "");
  }
  raw = raw.trim();
  if (!raw) return fallback;
  if (isOpaqueServerActionError(raw)) return fallback;
  return raw;
}

export function actionOk<T>(data: T): ActionOk<T> {
  return { ok: true, data };
}

export function actionFail(message: string, fallback?: string): ActionFail {
  return { ok: false, message: formatActionError(message, fallback) };
}

/** PostgREST / supabase-js error shape. */
export function actionFailFromSupabase(
  error: { message?: string } | null | undefined,
  fallback?: string,
): ActionFail {
  return actionFail(error?.message || "", fallback);
}

/**
 * Run a server mutation and always return ActionResult.
 * Use inside `"use server"` so unexpected throws still become `{ ok: false, message }`.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  fallback?: string,
): Promise<ActionResult<T>> {
  try {
    return actionOk(await fn());
  } catch (err) {
    return actionFail(formatActionError(err, fallback), fallback);
  }
}

/** Narrow helper for UI: message if fail, else null. */
export function actionErrorMessage(result: ActionResult<unknown>): string | null {
  return result.ok ? null : result.message;
}
