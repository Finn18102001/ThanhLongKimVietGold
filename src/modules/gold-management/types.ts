export type GoldObligationKind = "RECEIVABLE" | "PAYABLE";

export type PartyType = "SUPPLIER" | "CUSTOMER" | "PARTNER";

export type ReceivableStatus = "NOT_RECEIVED" | "PARTIAL" | "RECEIVED";
export type PayableStatus = "NOT_DELIVERED" | "PARTIAL" | "DELIVERED";
export type ObligationStatus = ReceivableStatus | PayableStatus;

export type GoldTab = "overview" | "receivable" | "payable";

export type GoldObligationRow = {
  id: string;
  kind: GoldObligationKind;
  occurredAt: string;
  documentNo: string;
  sourceType: "PURCHASE" | "SALE";
  sourceId: string;
  partyType: PartyType;
  partyName: string;
  brandName: string | null;
  productName: string;
  skuCode: string;
  quantityOrdered: number;
  quantitySettled: number;
  quantityRemaining: number;
  weightChiPerUnit: number;
  totalChiRemaining: number;
  actorEmail: string;
  status: ObligationStatus;
};

export type GoldObligationSummary = {
  receivableCount: number;
  receivableChi: number;
  payableCount: number;
  payableChi: number;
};

export type GoldFilterState = {
  dateFrom: string;
  dateTo: string;
  partyQuery: string;
  actorQuery: string;
  brand: string;
  productQuery: string;
  status: string;
};
