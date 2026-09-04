export type CashAccountType = "CASH" | "BANK";

export type CashTxnType =
  | "SALE_PAYMENT"
  | "PURCHASE_PAYMENT"
  | "RECEIVABLE_COLLECTION"
  | "PAYABLE_PAYMENT"
  | "OTHER_INCOME"
  | "OTHER_EXPENSE"
  | "TRANSFER";

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
};

export type CashLedgerPage = {
  items: CashLedgerRow[];
  total: number;
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

export const TXN_TYPE_LABEL: Record<CashTxnType, string> = {
  SALE_PAYMENT: "SALE_PAYMENT",
  PURCHASE_PAYMENT: "PURCHASE_PAYMENT",
  RECEIVABLE_COLLECTION: "RECEIVABLE_COLLECTION",
  PAYABLE_PAYMENT: "PAYABLE_PAYMENT",
  OTHER_INCOME: "OTHER_INCOME",
  OTHER_EXPENSE: "OTHER_EXPENSE",
  TRANSFER: "TRANSFER",
};
