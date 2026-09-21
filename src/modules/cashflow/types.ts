export type CashAccountType = "CASH" | "BANK";

export type CashTxnType =
  | "SALE_PAYMENT"
  | "PURCHASE_PAYMENT"
  | "RECEIVABLE_COLLECTION"
  | "PAYABLE_PAYMENT"
  | "OTHER_INCOME"
  | "OTHER_EXPENSE"
  | "TRANSFER"
  | "SALE_VOID_REFUND"
  | "PURCHASE_VOID_RECLAIM";

export type CashAccountCard = {
  id: string;
  code: string;
  name: string;
  accountType: CashAccountType;
  balanceDong: number;
  inTodayDong: number;
  outTodayDong: number;
  txnToday: number;
};

export type CashflowOverview = {
  businessDate: string;
  cash: CashAccountCard | null;
  bank: CashAccountCard | null;
  availableDong: number;
  sevenDay: { inDong: number; outDong: number; netDong: number };
  receivableDong: number;
  payableDong: number;
  stockCapitalDong: number;
};

export type CashLedgerRow = {
  id: string;
  occurredAt: string;
  txnType: CashTxnType;
  direction: "IN" | "OUT";
  amountDong: number;
  balanceAfterDong: number;
  content: string;
  accountCode: string;
  accountName: string;
  referenceCode: string | null;
  actorEmail: string;
  /** Linked customer for sale/buy/void cash movements; empty otherwise. */
  customerName: string | null;
  customerCitizenId: string | null;
};

export type CashLedgerPage = {
  items: CashLedgerRow[];
  total: number;
  limit: number;
  offset: number;
  sumInDong: number;
  sumOutDong: number;
  netDong: number;
};

export type CashLedgerFilters = {
  from: string;
  to: string;
  accountId?: string | null;
  txnType?: string | null;
  direction?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

export type CapitalGroupRow = {
  groupName: string;
  capitalDong: number;
  sharePercent: number;
};

export type CapitalSnapshot = {
  totalDong: number;
  groups: CapitalGroupRow[];
};

/** One order that still carries, or once carried, a cash debt. */
export type CashObligationSide = "RECEIVABLE" | "PAYABLE";

export type CashObligationRow = {
  id: string;
  side: CashObligationSide;
  /** Sale/buy voucher code. */
  code: string;
  /** Issued invoice number. Null for buy vouchers. */
  invoiceNo: string | null;
  occurredAt: string;
  partyName: string;
  transactionType: string;
  totalDong: number;
  settledDong: number;
  remainingDong: number;
  paymentStatus: string;
  actorEmail: string;
  /** Promised payment date, ISO date. Null when none was set. */
  dueDate: string | null;
};

export type CashObligationFilters = {
  side: "ALL" | CashObligationSide;
  from: string;
  to: string;
  status: string;
  q: string;
};

export const TXN_TYPE_LABEL: Record<CashTxnType, string> = {
  SALE_PAYMENT: "Thu bán hàng",
  PURCHASE_PAYMENT: "Chi mua hàng",
  RECEIVABLE_COLLECTION: "Thu công nợ",
  PAYABLE_PAYMENT: "Chi trả nợ",
  OTHER_INCOME: "Thu khác",
  OTHER_EXPENSE: "Chi khác",
  TRANSFER: "Chuyển quỹ",
  SALE_VOID_REFUND: "Hủy HĐ — hoàn tiền",
  PURCHASE_VOID_RECLAIM: "Hủy mua — hoàn tiền đã trả",
};
