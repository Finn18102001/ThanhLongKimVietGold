import { getEmployeeCashAccess } from "./query";
import { canOpenEmployeeGoldModule } from "@/modules/fund-gold/query";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import { withPerfSpan } from "@/shared/lib/perf-span";

export type CashClerkShellMode = "none" | "cash_clerk" | "normal";

/**
 * NV chỉ gắn Quỹ tiền (không Admin, không Quỹ vàng) → thay catalog Bán/Mua bằng card YC.
 * Admin / NV bán (có QV) / kiêm → giữ POS thường.
 *
 * PERF-002: flag/access are React.cache'd; when cash looks like clerk-only, gold gate
 * still runs (same rule). Early exits unchanged so Admin never becomes cash_clerk.
 */
export async function resolveCashClerkShellMode(): Promise<CashClerkShellMode> {
  return withPerfSpan("shell.cashClerkMode", async () => {
    const flagOn = await isEmployeeFundEnabled();
    if (!flagOn) return "none";

    const cash = await getEmployeeCashAccess();
    if (!cash.canAccess || cash.isAdmin || !cash.staffAccountId) return "normal";

    let hasGold = false;
    try {
      const gold = await canOpenEmployeeGoldModule();
      hasGold = gold.allowed && Boolean(gold.access.staffAccountId) && !gold.access.isAdmin;
    } catch {
      hasGold = false;
    }

    if (hasGold) return "normal";
    return "cash_clerk";
  });
}
