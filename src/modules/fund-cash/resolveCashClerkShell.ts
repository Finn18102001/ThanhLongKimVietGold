import { getEmployeeCashAccess } from "./query";
import { canOpenEmployeeGoldModule } from "@/modules/fund-gold/query";
import { isEmployeeFundEnabled } from "@/modules/settings/query";

export type CashClerkShellMode = "none" | "cash_clerk" | "normal";

/**
 * NV chỉ gắn Quỹ tiền (không Admin, không Quỹ vàng) → thay catalog Bán/Mua bằng card YC.
 * Admin / NV bán (có QV) / kiêm → giữ POS thường.
 */
export async function resolveCashClerkShellMode(): Promise<CashClerkShellMode> {
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
}
