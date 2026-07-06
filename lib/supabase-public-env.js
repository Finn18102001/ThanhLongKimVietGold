"use strict";

const DEFAULTS = require("./supabase-public-defaults");

function trimEnv(v) {
  return String(v || "").trim();
}

/**
 * Resolve public Supabase URL + anon/publishable key for server routes.
 * Supports SUPABASE_* and NEXT_PUBLIC_* (.env / deploy host).
 * Falls back to project defaults when env is unset (parity with boot-supabase-env.js).
 */
function supabasePublicEnv() {
  let url = (
    trimEnv(process.env.SUPABASE_URL) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    DEFAULTS.URL
  ).replace(/\/$/, "");
  const anonKey =
    trimEnv(process.env.SUPABASE_ANON_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    DEFAULTS.ANON_KEY;
  return { url, anonKey };
}

module.exports = { supabasePublicEnv, trimEnv };
