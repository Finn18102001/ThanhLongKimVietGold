export type Form02Line = {
  stt: number;
  buyId: string;
  itemId: string;
  buyNo: string;
  form02No: string;
  status: string;
  workflowStatus: string | null;
  purchasedAt: string;
  sellerName: string | null;
  sellerAddress: string | null;
  sellerCitizenId: string | null;
  sellerPhone: string | null;
  productName: string;
  quantity: number;
  weightChi: number;
  unitPriceDong: number;
  lineTotalDong: number;
  buyTotalDong: number;
  actorEmail: string | null;
};

export type Form02ListPage = {
  items: Form02Line[];
  total: number;
  limit: number;
  offset: number;
};

export type Form02ListFilter = {
  from?: string | null;
  to?: string | null;
  docNo?: string | null;
  seller?: string | null;
  actor?: string | null;
  limit?: number;
  offset?: number;
};
