export type DepositWorkflowStatus =
  | "AWAITING_AGREEMENT"
  | "AGREEMENT_CONFIRMED"
  | "SLIP_ISSUED"
  | "AWAITING_DELIVERY"
  | "COMPLETED"
  | "CANCELLED";

export type SaleItemFulfillStatus =
  | "IN_STOCK"
  | "BACKORDER"
  | "READY"
  | "PARTIAL"
  | "DELIVERED";

export type DepositDocKind = "AGREEMENT" | "SLIP" | "HANDOVER";

/** Staff-editable blanks on the three Word templates. Invoice money/items stay live. */
export type DepositDocPayload = {
  place?: string;
  seller_representative?: string;
  seller_title?: string;
  seller_bank_account?: string;
  seller_bank_name?: string;
  buyer_representative?: string;
  buyer_title?: string;
  price_locked?: boolean;
  payment_other?: string;
  delivery_from?: string;
  delivery_to?: string;
  delivery_place?: string;
  receipt_no?: string;
  transfer_content?: string;
  gold_price_locked?: boolean;
  handover_note?: string;
};

export type DepositLine = {
  id: string;
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceDong: number;
  totalPriceDong: number;
  weightChi: number;
  totalWeightChi: number;
  purity: string | null;
  itemStatus: SaleItemFulfillStatus;
  qtyAvailableAtOrder: number;
  qtyDelivered: number;
  currentStock: number;
  /** Per piece snapshot. Null on lines sold before the gold / stone / labor split (print the single legacy row). */
  goldAmountDong: number | null;
  stoneWeightChi: number;
  /** Số lượng đá (viên) / chiếc. 0 on lines sold with a hand-typed stone amount. */
  stoneQuantity: number;
  /** Đơn giá đá / viên. */
  stoneUnitPriceDong: number;
  /** Thành tiền đá / chiếc = đơn giá đá × số lượng đá. */
  stonePriceDong: number;
  laborFinalDong: number | null;
};

/** Khoản thu thêm của đơn (`pos_sale_charges`): in riêng, không gộp vào đơn giá vàng. */
export type DepositCharge = {
  id: string;
  name: string;
  amountDong: number;
};

export type DepositPayment = {
  id: string;
  amountDong: number;
  paymentMethod: string;
  paidAt: string;
  note: string | null;
};

export type DepositSaleBundle = {
  saleId: string;
  saleNo: string;
  invoiceId: string | null;
  invoiceNo: string | null;
  issuedAt: string;
  actorEmail: string;
  operatorName: string | null;
  transactionType: "SALE" | "PREORDER" | "DEPOSIT";
  fulfillmentStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  dueDate: string | null;
  pickupDueAt: string | null;
  note: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerCitizenId: string | null;
  customerTaxCode: string | null;
  depositWorkflowStatus: DepositWorkflowStatus | null;
  depositAgreementNo: string | null;
  depositSlipNo: string | null;
  deliveryReceiptNo: string | null;
  depositDeliveryPlace: string | null;
  depositPriceLocked: boolean;
  payload: DepositDocPayload;
  lines: DepositLine[];
  charges: DepositCharge[];
  payments: DepositPayment[];
};

export function isDepositWorkflow(status: string | null | undefined): boolean {
  return Boolean(status);
}

/** Prefer Result over throw — production strips Server Action error messages (React #441). */
export type { ActionResult } from "@/shared/lib/action-result";
export type DepositActionResult =
  | { ok: true; bundle: DepositSaleBundle }
  | { ok: false; message: string };
