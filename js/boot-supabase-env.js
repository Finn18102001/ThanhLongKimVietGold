/**
 * Supabase public config for static hosting (Express route overrides this file when using node server).
 * All consumers should read window.__TLKV_SUPABASE__ via TLKVSupabase.readSupabaseConfig().
 */
(function (global) {
  var url = "https://yrdqnmsvwovwhepmhigv.supabase.co";
  var anonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZHFubXN2d292d2hlcG1oaWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTM1ODAsImV4cCI6MjA5MTMyOTU4MH0.PppGELLxSh0pcZklF8j2DuDeHhMq1HQIUZ-EuQkkpSA";

  global.TLKV_SUPABASE_URL = url;
  global.TLKV_SUPABASE_ANON_KEY = anonKey;
  global.__TLKV_SUPABASE__ = { url: url, anonKey: anonKey };
  global.__TLKV_DISABLE_GOLD_SSE = true;
})(typeof window !== "undefined" ? window : globalThis);
