import { assertAdminRead } from "@/shared/auth/assert";
import { createServerSupabase } from "@/shared/supabase/server";
import { payableStatus, receivableStatus } from "./labels";
import type { GoldObligationRow, GoldObligationSummary } from "./types";

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatPaymentAmount(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(amount))}đ`;
}

/** One line per real payment, then the unpaid balance when any remains. */
function formatPaymentHistory(amounts: number[], remainingDong: number): string {
  const paid = amounts.filter((amount) => amount > 0);
  if (paid.length === 0) return "Chưa thanh toán";
  const lines = paid.map(
    (amount, index) => `Lần ${index + 1}: ${formatPaymentAmount(amount)}`,
  );
  if (remainingDong > 0) lines.push(`Còn lại: ${formatPaymentAmount(remainingDong)}`);
  return lines.join("\n");
}

function paymentAmounts(
  value:
    | { amount_dong: number | string | null; paid_at?: string | null }[]
    | { amount_dong: number | string | null; paid_at?: string | null }
    | null
    | undefined,
): number[] {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return [...rows]
    .sort((a, b) => String(a.paid_at ?? "").localeCompare(String(b.paid_at ?? "")))
    .map((row) => Number(row.amount_dong ?? 0));
}

/**
 * Warehouse order (goods NOT_RECEIVED): stock not applied yet → settled = 0.
 * After receive / partial receive: settled = received_qty, remaining = expected - received.
 * Never report negative remaining.
 */
function purchaseSettledQty(goodsStatus: string, expectedQty: number, receivedQty: number): number {
  if (goodsStatus === "NOT_RECEIVED") return 0;
  return Math.min(clampNonNeg(receivedQty), clampNonNeg(expectedQty));
}

export async function listGoldObligations(): Promise<{
  rows: GoldObligationRow[];
  summary: GoldObligationSummary;
}> {
  await assertAdminRead();
  const supabase = await createServerSupabase();

  const [purchaseRes, saleRes] = await Promise.all([
    supabase
      .from("pos_purchase_receipts")
      .select(
        `id, receipt_no, goods_status, supplier_name, actor_email, created_at, voided_at,
         remaining_dong,
         pos_purchase_payments(amount_dong, paid_at),
         pos_purchase_items(
           id, expected_qty, received_qty, weight_chi,
           pos_skus(sku, name, weight_chi, brands(name))
         )`,
      )
      .is("voided_at", null)
      .neq("goods_status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("pos_sales")
      .select(
        `id, sale_no, transaction_type, fulfillment_status, actor_email, created_at, voided_at,
         remaining_dong,
         pos_customers(name, phone, citizen_id),
         pos_sale_payments(amount_dong, paid_at),
         pos_sale_items(
           id, quantity, qty_delivered, weight_chi, product_name_snapshot, sku_snapshot, sku_id,
           pos_skus(sku, name, brands(name))
         )`,
      )
      .is("voided_at", null)
      .in("transaction_type", ["PREORDER", "DEPOSIT"])
      .neq("fulfillment_status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (purchaseRes.error) throw new Error(purchaseRes.error.message);
  if (saleRes.error) throw new Error(saleRes.error.message);

  const rows: GoldObligationRow[] = [];

  for (const receipt of purchaseRes.data ?? []) {
    const items = Array.isArray(receipt.pos_purchase_items)
      ? receipt.pos_purchase_items
      : receipt.pos_purchase_items
        ? [receipt.pos_purchase_items]
        : [];

    for (const item of items) {
      const expected = clampNonNeg(Number(item.expected_qty ?? 0));
      if (expected <= 0) continue;
      const settled = purchaseSettledQty(
        String(receipt.goods_status),
        expected,
        Number(item.received_qty ?? 0),
      );
      const remaining = Math.max(0, expected - settled);
      const sku = firstEmbed(
        item.pos_skus as
          | {
              sku: string;
              name: string;
              weight_chi: number | null;
              brands: { name: string } | { name: string }[] | null;
            }
          | {
              sku: string;
              name: string;
              weight_chi: number | null;
              brands: { name: string } | { name: string }[] | null;
            }[]
          | null,
      );
      const brand = firstEmbed(sku?.brands ?? null);
      const weight =
        item.weight_chi != null
          ? Number(item.weight_chi)
          : sku?.weight_chi != null
            ? Number(sku.weight_chi)
            : 0;
      const receiptPayments = paymentAmounts(
        receipt.pos_purchase_payments as
          | { amount_dong: number | string | null; paid_at?: string | null }[]
          | null,
      );

      rows.push({
        id: `recv:${item.id}`,
        kind: "RECEIVABLE",
        occurredAt: receipt.created_at,
        documentNo: receipt.receipt_no,
        sourceType: "PURCHASE",
        sourceId: receipt.id,
        partyType: "SUPPLIER",
        partyName: receipt.supplier_name || "—",
        brandName: brand?.name ?? null,
        productName: sku?.name ?? "—",
        skuCode: sku?.sku ?? "",
        quantityOrdered: expected,
        quantitySettled: settled,
        quantityRemaining: remaining,
        weightChiPerUnit: weight,
        totalChiRemaining: Number((remaining * weight).toFixed(4)),
        actorEmail: receipt.actor_email || "—",
        status: receivableStatus(expected, settled),
        partyPhone: "",
        partyCitizenId: "",
        paymentHistory: formatPaymentHistory(
          receiptPayments,
          Number(receipt.remaining_dong ?? 0),
        ),
      });
    }
  }

  for (const sale of saleRes.data ?? []) {
    const items = Array.isArray(sale.pos_sale_items)
      ? sale.pos_sale_items
      : sale.pos_sale_items
        ? [sale.pos_sale_items]
        : [];
    const customer = firstEmbed(
      sale.pos_customers as
        | { name: string; phone: string | null; citizen_id: string | null }
        | { name: string; phone: string | null; citizen_id: string | null }[]
        | null,
    );
    const salePayments = paymentAmounts(
      sale.pos_sale_payments as
        | { amount_dong: number | string | null; paid_at?: string | null }[]
        | null,
    );
    const paymentHistory = formatPaymentHistory(
      salePayments,
      Number(sale.remaining_dong ?? 0),
    );

    for (const item of items) {
      const ordered = clampNonNeg(Number(item.quantity ?? 0));
      if (ordered <= 0) continue;
      const settled = Math.min(clampNonNeg(Number(item.qty_delivered ?? 0)), ordered);
      const remaining = Math.max(0, ordered - settled);
      const sku = firstEmbed(
        item.pos_skus as
          | { sku: string; name: string; brands: { name: string } | { name: string }[] | null }
          | { sku: string; name: string; brands: { name: string } | { name: string }[] | null }[]
          | null,
      );
      const brand = firstEmbed(sku?.brands ?? null);
      const weight = Number(item.weight_chi ?? 0);

      rows.push({
        id: `pay:${item.id}`,
        kind: "PAYABLE",
        occurredAt: sale.created_at,
        documentNo: sale.sale_no,
        sourceType: "SALE",
        sourceId: sale.id,
        partyType: "CUSTOMER",
        partyName: customer?.name || "—",
        brandName: brand?.name ?? null,
        productName: item.product_name_snapshot || sku?.name || "—",
        skuCode: item.sku_snapshot || sku?.sku || "",
        quantityOrdered: ordered,
        quantitySettled: settled,
        quantityRemaining: remaining,
        weightChiPerUnit: weight,
        totalChiRemaining: Number((remaining * weight).toFixed(4)),
        actorEmail: sale.actor_email || "—",
        status: payableStatus(ordered, settled),
        partyPhone: customer?.phone?.trim() || "",
        partyCitizenId: customer?.citizen_id?.trim() || "",
        paymentHistory,
      });
    }
  }

  rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

  const openReceivable = rows.filter((r) => r.kind === "RECEIVABLE" && r.quantityRemaining > 0);
  const openPayable = rows.filter((r) => r.kind === "PAYABLE" && r.quantityRemaining > 0);

  const summary: GoldObligationSummary = {
    receivableCount: openReceivable.length,
    receivableChi: Number(
      openReceivable.reduce((sum, r) => sum + r.totalChiRemaining, 0).toFixed(4),
    ),
    payableCount: openPayable.length,
    payableChi: Number(openPayable.reduce((sum, r) => sum + r.totalChiRemaining, 0).toFixed(4)),
  };

  return { rows, summary };
}
