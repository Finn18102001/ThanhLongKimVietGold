export type EmployeeGoldAccountKind = "STAFF" | "ADMIN_POOL";

export type EmployeeGoldAccount = {
  id: string;
  code: string;
  name: string;
  kind: EmployeeGoldAccountKind;
  staffId: string | null;
  staffName: string | null;
  staffEmail: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

export type EmployeeGoldStockRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  storeQuantity: number;
  updatedAt: string | null;
};

export type EmployeeGoldLedgerRow = {
  id: string;
  accountId: string;
  accountCode: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  txnType: string;
  direction: "IN" | "OUT";
  quantity: number;
  qtyBefore: number;
  qtyAfter: number;
  content: string;
  reason: string | null;
  referenceCode: string | null;
  transferGroupId: string | null;
  actorEmail: string;
  occurredAt: string;
};

export type EmployeeGoldLedgerPage = {
  items: EmployeeGoldLedgerRow[];
  total: number;
  limit: number;
  offset: number;
};

export type EmployeeGoldCountLine = {
  skuId: string;
  skuCode: string;
  skuName: string;
  systemQty: number;
  countedQty: number;
  diffQty: number;
  note: string | null;
};

export type EmployeeGoldCountRow = {
  id: string;
  code: string;
  accountId: string;
  accountCode: string;
  note: string | null;
  countedByEmail: string;
  countedAt: string;
  lines: EmployeeGoldCountLine[];
};

export type GoldSkuOption = {
  skuId: string;
  skuCode: string;
  skuName: string;
  storeQuantity: number;
};

export type EmployeeGoldAccess = {
  canAccess: boolean;
  isAdmin: boolean;
  staffAccountId: string | null;
};

/** P10-03: đơn SALE đã lưu, chờ QT rồi QV xác nhận trả vàng */
export type SaleAwaitingGoldRow = {
  saleId: string;
  saleNo: string;
  invoiceNo: string | null;
  totalDong: number;
  paidDong: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string | null;
  customerName: string | null;
  pendingYcCount: number;
  confirmedYcCount: number;
  canConfirmGold: boolean;
};

export type SaleAwaitingGoldList = {
  items: SaleAwaitingGoldRow[];
  total: number;
};
