/**
 * @supabase/supabase-js v2 cần global fetch + Headers (Node 18+).
 * Polyfill cho Node 17 trở xuống qua undici.
 */
(function () {
  if (typeof globalThis.fetch === "function" && typeof globalThis.Headers === "function") {
    return;
  }

  var undici;
  try {
    undici = require("undici");
  } catch (err) {
    console.error(
      "[TLKV] Không load được undici:",
      err && err.message ? err.message : err,
      "— Nâng cấp Node lên >= 18.17 (khuyến nghị 20 LTS)."
    );
    return;
  }

  if (typeof globalThis.fetch !== "function" && undici.fetch) {
    globalThis.fetch = undici.fetch;
  }
  if (typeof globalThis.Headers !== "function" && undici.Headers) {
    globalThis.Headers = undici.Headers;
  }
  if (typeof globalThis.Request !== "function" && undici.Request) {
    globalThis.Request = undici.Request;
  }
  if (typeof globalThis.Response !== "function" && undici.Response) {
    globalThis.Response = undici.Response;
  }
})();
