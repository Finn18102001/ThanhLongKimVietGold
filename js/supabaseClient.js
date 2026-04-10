/**
 * Client Supabase cho trình duyệt (ES module).
 *
 * Trên mỗi trang HTML, load script boot TRƯỚC module này:
 *   <script src="/js/boot-supabase-env.js"></script>
 *   <script type="module">
 *     import { supabase, supabaseUrl, supabaseAnonKey } from "/js/supabaseClient.js";
 *   </script>
 *
 * Biến môi trường (server đọc .env rồi .env.local, inject qua boot-supabase-env.js):
 *   SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY hoặc NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0?target=es2022";

const cfg =
  typeof globalThis !== "undefined" && globalThis.__TLKV_SUPABASE__
    ? globalThis.__TLKV_SUPABASE__
    : { url: "", anonKey: "" };

/** @type {string} */
export const supabaseUrl = String(cfg.url || "").trim();

/** @type {string} */
export const supabaseAnonKey = String(cfg.anonKey || "").trim();

/** Client đã cấu hình; null nếu thiếu URL hoặc anon key trong .env */
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
