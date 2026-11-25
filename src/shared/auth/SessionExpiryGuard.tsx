"use client";

import { useEffect, useRef } from "react";
import { forceSignOut } from "@/app/login/actions";
import { AUTH_LOGOUT_CHANNEL, msUntil } from "./session-policy";

type Props = {
  sessionExpiresAt: string | null;
  workHoursApplies: boolean;
  workHoursEndAt: string | null;
};

type LogoutReason = "session" | "work_hours";

function broadcastLogout(reason: LogoutReason) {
  try {
    const channel = new BroadcastChannel(AUTH_LOGOUT_CHANNEL);
    channel.postMessage({ type: "logout", reason });
    channel.close();
  } catch {
    // BroadcastChannel unavailable (older browsers) — cookie clear still wins.
  }
}

export function SessionExpiryGuard({
  sessionExpiresAt,
  workHoursApplies,
  workHoursEndAt,
}: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(AUTH_LOGOUT_CHANNEL);
      channel.onmessage = (event) => {
        const data = event.data as { type?: string; reason?: LogoutReason } | null;
        if (data?.type !== "logout" || firedRef.current) return;
        firedRef.current = true;
        const reason = data.reason === "session" ? "session" : "work_hours";
        void forceSignOut(reason);
      };
    } catch {
      channel = null;
    }

    const timers: number[] = [];

    function arm(iso: string | null, reason: LogoutReason) {
      const wait = msUntil(iso);
      if (wait == null) return;
      if (wait === 0) {
        if (firedRef.current) return;
        firedRef.current = true;
        broadcastLogout(reason);
        void forceSignOut(reason);
        return;
      }
      // Cap setTimeout (browsers clamp very large delays); re-check near end.
      const delay = Math.min(wait, 2_147_000_000);
      const id = window.setTimeout(() => {
        if (firedRef.current) return;
        const remaining = msUntil(iso);
        if (remaining == null) return;
        if (remaining > 0 && remaining < wait) {
          arm(iso, reason);
          return;
        }
        firedRef.current = true;
        broadcastLogout(reason);
        void forceSignOut(reason);
      }, delay);
      timers.push(id);
    }

    arm(sessionExpiresAt, "session");
    if (workHoursApplies) {
      arm(workHoursEndAt, "work_hours");
    }

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      channel?.close();
    };
  }, [sessionExpiresAt, workHoursApplies, workHoursEndAt]);

  return null;
}
