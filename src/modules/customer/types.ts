export const CUSTOMER_GROUPS = ["RETAIL", "MEMBER", "LOYAL", "VIP"] as const;
export const CUSTOMER_GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export const CUSTOMER_TYPES = ["INDIVIDUAL", "BUSINESS"] as const;
export const CCCD_DOCUMENT_TYPES = ["CCCD_FRONT", "CCCD_BACK"] as const;

export type CustomerGroup = (typeof CUSTOMER_GROUPS)[number];
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type CccdDocumentType = (typeof CCCD_DOCUMENT_TYPES)[number];
export type CustomerSort = "newest" | "name" | "total";
export type CustomerActivityFilter = "" | "purchased" | "never";

export type CustomerDirectoryStats = {
  totalCustomers: number;
  newCustomers30d: number;
  totalSpendingDong: number;
  totalOrders: number;
  avgOrderDong: number;
};

export type CustomerDocument = {
  id: string;
  documentType: CccdDocumentType;
  storagePath: string;
  mimeType: string | null;
  byteSize: number | null;
  uploadedBy: string;
  uploadedAt: string;
  signedUrl?: string | null;
};

export type CustomerRecord = {
  id: string;
  customerNo: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  note: string | null;
  gender: CustomerGender | null;
  customerGroup: CustomerGroup;
  dateOfBirth: string | null;
  isWalkIn: boolean;
  customerType: CustomerType;
  nationality: string | null;
  citizenId: string | null;
  citizenIdIssueDate: string | null;
  citizenIdIssuePlace: string | null;
  businessName: string | null;
  representativeName: string | null;
  documents: CustomerDocument[];
  createdAt: string;
  updatedAt: string;
  totalDong: number;
  saleCount: number;
  debtDong: number;
  lastActivityAt: string;
};

export type CustomerActivityKind = "SALE" | "BUY";

export type CustomerHistoryItem = {
  activityId: string;
  activityKind: CustomerActivityKind;
  docNo: string;
  invoiceId: string | null;
  invoiceNo: string;
  saleNo: string;
  issuedAt: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  paymentStatus: string;
  transactionType: string;
  fulfillmentStatus: string;
  status: string;
  paymentMethod: string;
};

export type CustomerListPage = {
  items: CustomerRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type CustomerDetail = {
  customer: CustomerRecord;
  history: CustomerHistoryItem[];
};

export type CustomerInput = {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  taxCode?: string | null;
  note?: string | null;
  gender?: CustomerGender | null;
  customerGroup?: CustomerGroup;
  dateOfBirth?: string | null;
  customerType?: CustomerType;
  nationality?: string | null;
  citizenId?: string | null;
  citizenIdIssueDate?: string | null;
  citizenIdIssuePlace?: string | null;
  businessName?: string | null;
  representativeName?: string | null;
};
