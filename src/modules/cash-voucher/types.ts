export type CashVoucherKind = "THU" | "CHI";
export type CashVoucherStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "REVERSED";

export type CashVoucherRow = {
  id: string;
  code: string;
  kind: CashVoucherKind;
  status: CashVoucherStatus;
  amountDong: number;
  paymentMethod: string;
  content: string;
  sourceType: "sale" | "buy" | string;
  sourceId: string;
  sourceCode: string | null;
  customerName: string | null;
  createdByEmail: string;
  createdAt: string;
  cashAccountCode: string | null;
  cashAccountName: string | null;
  cashHolderName: string | null;
  cashHolderEmail: string | null;
  goldAccountCode: string | null;
  goldAccountName: string | null;
  goldHolderName: string | null;
  confirmedByEmail: string | null;
  confirmedAt: string | null;
  rejectedByEmail: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  reversedByEmail: string | null;
  reversedAt: string | null;
};

export type CashVoucherListFilter = {
  from?: string | null;
  to?: string | null;
  code?: string | null;
  kind?: string | null;
  status?: string | null;
  createdBy?: string | null;
  confirmedBy?: string | null;
  cashHolder?: string | null;
  goldHolder?: string | null;
  limit?: number;
  offset?: number;
};

export type CashVoucherListPage = {
  items: CashVoucherRow[];
  total: number;
  limit: number;
  offset: number;
};
