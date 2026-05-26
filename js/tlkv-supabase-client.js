/**
 * Shared Supabase browser client — single instance, consistent config resolution.
 * Load after /js/vendor/supabase.js and /js/boot-supabase-env.js
 */
(function (global) {
  "use strict";

  var __client = null;
  var __promise = null;

  function readSupabaseConfig() {
    var cfg = global.__TLKV_SUPABASE__;
    if (cfg && String(cfg.url || "").trim() && String(cfg.anonKey || "").trim()) {
      return {
        url: String(cfg.url).trim(),
        anonKey: String(cfg.anonKey).trim(),
      };
    }
    var url = String(global.TLKV_SUPABASE_URL || "").trim();
    var anonKey = String(global.TLKV_SUPABASE_ANON_KEY || "").trim();
    if (url && anonKey) {
      return { url: url, anonKey: anonKey };
    }
    return { url: "", anonKey: "" };
  }

  function getSupabaseClient() {
    if (!__promise) {
      __promise = Promise.resolve().then(function () {
        var cfg = readSupabaseConfig();
        var sdk = global.supabase;
        if (!cfg.url || !cfg.anonKey) {
          console.warn(
            "[TLKV Supabase] Thiếu url hoặc anon key. Kiểm tra boot-supabase-env.js / __TLKV_SUPABASE__."
          );
          return null;
        }
        if (!sdk || typeof sdk.createClient !== "function") {
          console.warn("[TLKV Supabase] supabase.js chưa load.");
          return null;
        }
        if (!__client) {
          __client = sdk.createClient(cfg.url, cfg.anonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storageKey: "tlkv-supabase-auth",
            },
          });
        }
        return __client;
      });
    }
    return __promise;
  }

  function resetSupabaseClient() {
    __client = null;
    __promise = null;
  }

  global.TLKVSupabase = {
    readSupabaseConfig: readSupabaseConfig,
    getSupabaseClient: getSupabaseClient,
    resetSupabaseClient: resetSupabaseClient,
  };
})(typeof window !== "undefined" ? window : globalThis);
