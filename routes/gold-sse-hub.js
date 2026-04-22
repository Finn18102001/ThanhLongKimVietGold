/**
 * Một kết nối Realtime Supabase (Node) + fan-out Server-Sent Events tới mọi tab đang mở.
 * Trình duyệt không mở WebSocket Realtime riêng — chỉ giữ một SSE tới server.
 */
const { createClient } = require("@supabase/supabase-js");

function trimEnv(v) {
  return String(v || "").trim();
}

function supabasePublicEnv() {
  const url =
    trimEnv(process.env.SUPABASE_URL) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    trimEnv(process.env.SUPABASE_ANON_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return { url, key };
}

const LOG = "[TLKV gold-push]";

const clients = new Set();
let hubClient = null;
let hubChannel = null;
let __broadcastCount = 0;

function sseLine(eventName, dataObj) {
  const data = JSON.stringify(dataObj == null ? {} : dataObj);
  return "event: " + eventName + "\ndata: " + data + "\n\n";
}

function broadcastGoldTableChanged(meta) {
  __broadcastCount += 1;
  const n = clients.size;
  if (meta && meta.table) {
    console.log(LOG + " hub: postgres_changes → SSE broadcast #" + __broadcastCount, {
      table: meta.table,
      eventType: meta.eventType || meta.event || "?",
      clients: n,
    });
  } else {
    console.log(LOG + " hub: SSE broadcast #" + __broadcastCount + " → " + n + " client(s)");
  }
  const chunk = sseLine("gold-table-changed", { t: Date.now(), n: __broadcastCount });
  for (const res of clients) {
    try {
      res.write(chunk);
    } catch (_) {}
  }
}

function stopHub() {
  if (hubChannel && hubClient) {
    try {
      hubClient.removeChannel(hubChannel);
    } catch (_) {}
    console.log(LOG + " hub: Supabase Realtime channel removed (no SSE clients)");
  }
  hubChannel = null;
  hubClient = null;
}

function ensureHub() {
  if (hubChannel) return true;
  const { url, key } = supabasePublicEnv();
  if (!url || !key) return false;

  console.log(LOG + " hub: starting Supabase Realtime (gold_meta + gold_price_rows)…");
  hubClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const onRow = function (payload) {
    broadcastGoldTableChanged({
      table: payload && payload.table,
      eventType: payload && payload.eventType,
    });
  };
  hubChannel = hubClient
    .channel("tlkv_gold_sse_broadcast")
    .on("postgres_changes", { event: "*", schema: "public", table: "gold_meta" }, onRow)
    .on("postgres_changes", { event: "*", schema: "public", table: "gold_price_rows" }, onRow);
  hubChannel.subscribe(function (status, err) {
    if (status === "SUBSCRIBED") {
      console.log(LOG + " hub: Realtime SUBSCRIBED — listening for DB changes");
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      console.warn(LOG + " hub: Realtime status", status, err || "");
      return;
    }
    console.log(LOG + " hub: Realtime status", status);
  });
  return true;
}

function addSseClient(res) {
  clients.add(res);
  ensureHub();
  console.log(LOG + " stream: client connected (SSE total " + clients.size + ")");
}

function removeSseClient(res) {
  clients.delete(res);
  console.log(LOG + " stream: client disconnected (SSE total " + clients.size + ")");
  if (clients.size === 0) stopHub();
}

module.exports = {
  addSseClient,
  removeSseClient,
  supabasePublicEnv,
  sseLine,
};
