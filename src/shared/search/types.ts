export type GlobalSearchItem =
  | {
      kind: "product";
      id: string;
      sku: string;
      name: string;
      href: string;
    }
  | {
      kind: "customer";
      id: string;
      name: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "invoice";
      invoiceNo: string;
      subtitle: string;
      href: string;
    };

export type GlobalSearchResponse = {
  query: string;
  products: GlobalSearchItem[];
  customers: GlobalSearchItem[];
  invoices: GlobalSearchItem[];
};
