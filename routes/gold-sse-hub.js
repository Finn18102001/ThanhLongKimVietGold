/**
 * Hub Server-Sent Events cho bảng giá vàng.
 *
 * Hai nguồn phát:
 *   (a) Supabase Realtime postgres_changes (gold_meta / gold_price_rows).
 *       Yêu cầu publication `supabase_realtime` chứa 2 bảng & RLS cho phép SELECT anon.
 *   (b) POST /api/gold-table/notify gọi thủ công (admin sau khi lưu).
 *       Đảm bảo SSE vẫn đẩy kể cả khi (a) chưa bật/bị lỗi.
 *
 * Trình duyệt chỉ giữ MỘT EventSource tới server; server giữ MỘT Realtime tới Supabase.
 */
const { createClient } = require("@supabase/supabase-js");
const { isServerlessHost, supabasePublicFromProcessEnv } = require("../lib/runtime-env");

const LOG = "[TLKV gold-push]";
const HEARTBEAT_MS = 20000;

function supabasePublicEnv() {
  const { url, anonKey } = supabasePublicFromProcessEnv();
  return { url, key: anonKey };
}

/** @type {Set<import("http").ServerResponse>} */
const clients = new Set();
let __clientSeq = 0;
let __broadcastCount = 0;
let hubClient = null;
let hubChannel = null;
let hubChannelStatus = "idle";
let heartbeatTimer = null;
let heartbeatCount = 0;

function sseLine(eventName, dataObj) {
  const data = JSON.stringify(dataObj == null ? {} : dataObj);
  return "event: " + eventName + "\ndata: " + data + "\n\n";
}

function writeSafe(res, chunk) {
  try {
    return res.write(chunk);
  } catch (_) {
    return false;
  }
}

function broadcastGoldTableChanged(info) {
  __broadcastCount += 1;
  const reason = (info && info.reason) || "realtime";
  const extra =
    info && info.table
      ? { table: info.table, eventType: info.eventType || info.event || "?" }
      : {};
  console.log(
    LOG +
      " hub: broadcast #" +
      __broadcastCount +
      " (" +
      reason +
      ") → " +
      clients.size +
      " client(s)",
    extra
  );
  const payload = Object.assign(
    { t: Date.now(), n: __broadcastCount, reason: reason },
    extra
  );
  const chunk = sseLine("gold-table-changed", payload);
  for (const res of clients) {
    writeSafe(res, chunk);
  }
}

function sendHeartbeat() {
  if (clients.size === 0) return;
  heartbeatCount += 1;
  const chunk = ": heartbeat " + heartbeatCount + " " + Date.now() + "\n\n";
  let alive = 0;
  for (const res of clients) {
    if (writeSafe(res, chunk)) alive += 1;
  }
  console.log(
    LOG + " hub: heartbeat #" + heartbeatCount + " → " + alive + "/" + clients.size + " alive"
  );
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
  if (heartbeatTimer && typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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
  hubChannelStatus = "idle";
  stopHeartbeat();
}

function ensureHub() {
  if (isServerlessHost()) return false;
  if (hubChannel) return true;
  const { url, key } = supabasePublicEnv();
  if (!url || !key) {
    console.warn(LOG + " hub: thiếu SUPABASE_URL / anon key trên server — chỉ dùng POST notify");
    return false;
  }

  console.log(LOG + " hub: starting Supabase Realtime (gold_meta + gold_price_rows)…");
  hubClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const onRow = function (payload) {
    broadcastGoldTableChanged({
      reason: "realtime",
      table: payload && payload.table,
      eventType: payload && payload.eventType,
    });
  };
  hubChannel = hubClient
    .channel("tlkv_gold_sse_broadcast")
    .on("postgres_changes", { event: "*", schema: "public", table: "gold_meta" }, onRow)
    .on("postgres_changes", { event: "*", schema: "public", table: "gold_price_rows" }, onRow);
  hubChannel.subscribe(function (status, err) {
    hubChannelStatus = status;
    if (status === "SUBSCRIBED") {
      console.log(
        LOG +
          " hub: Realtime SUBSCRIBED — đang nghe DB (nếu không thấy event khi đổi giá: check publication supabase_realtime + RLS SELECT anon)"
      );
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
  if (isServerlessHost()) return 0;
  __clientSeq += 1;
  const id = __clientSeq;
  res.__tlkvSseId = id;
  clients.add(res);
  ensureHub();
  startHeartbeat();
  console.log(LOG + " stream: client #" + id + " connected (total " + clients.size + ")");
  return id;
}

function removeSseClient(res) {
  const id = res && res.__tlkvSseId;
  clients.delete(res);
  console.log(LOG + " stream: client #" + (id || "?") + " disconnected (total " + clients.size + ")");
  if (clients.size === 0) stopHub();
}

function getDebugStatus() {
  return {
    clients: clients.size,
    broadcasts: __broadcastCount,
    heartbeats: heartbeatCount,
    hubStatus: hubChannelStatus,
    hubHasChannel: !!hubChannel,
    hasSupabaseEnv: (function () {
      const { url, key } = supabasePublicEnv();
      return !!url && !!key;
    })(),
  };
}

/** Gọi từ HTTP handler khi admin POST /notify. */
function manualBroadcast(reason) {
  broadcastGoldTableChanged({ reason: reason || "manual" });
}

module.exports = {
  addSseClient,
  removeSseClient,
  supabasePublicEnv,
  sseLine,
  manualBroadcast,
  getDebugStatus,
};
