import { getPosSession } from "@/shared/auth/session";
import { canAdminRead } from "@/shared/auth/permissions";
import { AccessDenied } from "@/shared/auth/AccessDenied";
import {
  getWorkShiftOverview,
  listWorkShiftStaffOptions,
  listWorkShifts,
} from "./actions";
import { WorkShiftDirectory } from "./WorkShiftDirectory";
import type { WorkShiftListPage, WorkShiftOverview } from "./types";

function emptyOverview(date: string): WorkShiftOverview {
  return {
    date,
    openedStaffCount: 0,
    activeCount: 0,
    closedCount: 0,
    autoClosedCount: 0,
  };
}

function emptyPage(date: string): WorkShiftListPage {
  return { items: [], total: 0, limit: 50, offset: 0, from: date, to: date };
}

export async function WorkShiftPage() {
  const session = await getPosSession();
  if (!session || !canAdminRead(session.role)) {
    return <AccessDenied role={session?.role ?? "STAFF"} />;
  }

  const today = session.businessDate;
  let overview = emptyOverview(today);
  let page = emptyPage(today);
  let staffOptions: Awaited<ReturnType<typeof listWorkShiftStaffOptions>> = [];

  try {
    [overview, page, staffOptions] = await Promise.all([
      getWorkShiftOverview(today),
      listWorkShifts({ from: today, to: today, limit: 50, offset: 0 }),
      listWorkShiftStaffOptions(),
    ]);
  } catch {
    // Migration chưa apply / RPC lỗi — UI vẫn mở với empty state.
  }

  return (
    <WorkShiftDirectory
      initialOverview={overview}
      initialPage={page}
      staffOptions={staffOptions}
      today={today}
    />
  );
}
