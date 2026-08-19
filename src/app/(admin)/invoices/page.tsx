import type { Metadata } from "next";
import { InvoicePage } from "@/modules/invoice/InvoicePage";

export const metadata: Metadata = {
  title: "Hóa đơn",
};

export default function InvoicesRoute() {
  return <InvoicePage />;
}
