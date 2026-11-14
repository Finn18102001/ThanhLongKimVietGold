export type LabelDraftCodeMode = "AUTO_MSP" | "PRE_ASSIGNED";

export type LabelDraftStatus = "DRAFT" | "PRINTED" | "RECEIVED" | "CANCELLED";

export type LabelDraftSummary = {
  id: string;
  codeMode: LabelDraftCodeMode;
  printableCode: string;
  productName: string;
  brandText: string;
  categoryText: string;
  costPriceDong: number | null;
  sellPriceDong: number | null;
  weightChi: number | null;
  status: LabelDraftStatus;
  printedAt: string | null;
  createdAt: string;
  createdBy: string;
  testMarker: string | null;
};

export type LabelDraftDetail = LabelDraftSummary & {
  typeCode: string;
  productNumber: string | null;
  reservedMsp: string | null;
  reservedSerialNo: string | null;
  productTypeText: string | null;
  priceRowId: string | null;
  priceNote: string | null;
  laborFeeDong: number | null;
  goldAgeText: string | null;
  stoneWeightChi: number | null;
  stoneQuantity: number | null;
  stoneUnitPriceDong: number | null;
  note: string | null;
  snapshotJson: Record<string, unknown>;
};

export type CreateLabelDraftInput = {
  codeMode: LabelDraftCodeMode;
  typeCode: string;
  productNumber?: string;
  productName: string;
  brandText: string;
  categoryText: string;
  productTypeText?: string;
  priceRowId?: string;
  priceNote?: string;
  costPriceDong?: number | null;
  sellPriceDong?: number | null;
  laborFeeDong?: number | null;
  weightChi?: number | null;
  goldAgeText?: string;
  note?: string;
  testMarker?: string | null;
};
