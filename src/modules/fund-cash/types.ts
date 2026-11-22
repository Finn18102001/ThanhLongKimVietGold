export type EmployeeCashAccountKind = "STAFF" | "ADMIN_POOL";
export type EmployeeCashMoneyKind = "CASH" | "BANK";

export type EmployeeCashAccount = {
  id: string;
  code: string;
  name: string;
  kind: EmployeeCashAccountKind;
  staffId: string | null;
  staffName: string | null;
  staffEmail: string | null;
  balanceDong: number;
  cashBalanceDong: number;
  bankBalanceDong: number;
  isActive: boolean;
  updatedAt: string | null;
};

export type EmployeeCashLedgerRow = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  txnType: string;
  direction: "IN" | "OUT";
  amountDong: number;
  moneyKind: EmployeeCashMoneyKind;
  balanceBeforeDong: number;
  balanceAfterDong: number;
  content: string;
  reason: string | null;
  referenceCode: string | null;
  transferGroupId: string | null;
  actorEmail: string;
  occurredAt: string;
};

export type EmployeeCashLedgerPage = {
  items: EmployeeCashLedgerRow[];
  total: number;
  limit: number;
  offset: number;
};

export type EmployeeCashAccess = {
  canAccess: boolean;
  isAdmin: boolean;
  staffAccountId: string | null;
};

export type CashTransferStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export type CashTransferRow = {
  id: string;
  code: string;
  status: CashTransferStatus;
  amountDong: number;
  moneyKind: EmployeeCashMoneyKind;
  content: string;
  fromAccountId: string;
  fromAccountCode: string;
  fromAccountName: string;
  fromStaffName: string | null;
  fromStaffEmail?: string | null;
  toAccountId: string;
  toAccountCode: string;
  toAccountName: string;
  toStaffName: string | null;
  toStaffEmail?: string | null;
  createdByEmail: string;
  createdAt: string;
  confirmedByEmail: string | null;
  confirmedAt: string | null;
  cancelledByEmail: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  transferGroupId: string | null;
  canConfirm: boolean;
  canCancel: boolean;
};

export type CashTransferListPage = {
  items: CashTransferRow[];
  total: number;
  limit: number;
  offset: number;
};

export type CashRequestStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "REVERSED"; // P10 M6 void HĐ
export type CashRequestKind = "THU" | "CHI";

export type CashRequestLine = {
  name: string;
  purity: string | null;
  unit: string | null;
  weight: number | null;
  unitPriceDong: number | null;
  amountDong: number | null;
};

export type CashRequestRow = {
  id: string;
  code: string;
  kind: CashRequestKind;
  status: CashRequestStatus;
  amountDong: number;
  paymentMethod: string;
  content: string;
  note: string | null;
  sourceType: "sale" | "buy";
  sourceId: string;
  sourceCode: string | null;
  customerName: string | null;
  customerCccd: string | null;
  relatedStaffName: string | null;
  relatedGoldAccountCode: string | null;
  requestedByEmail: string;
  createdAt: string;
  cashAccountCode: string | null;
  confirmedByEmail: string | null;
  confirmedAt: string | null;
  rejectedByEmail: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  lines: CashRequestLine[];
  canConfirm: boolean;
  canReject: boolean;
};

export type CashRequestListPage = {
  items: CashRequestRow[];
  total: number;
  limit: number;
  offset: number;
};
