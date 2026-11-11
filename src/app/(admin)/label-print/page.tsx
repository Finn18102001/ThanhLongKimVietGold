import { LabelPrintPage } from "@/modules/label-print/LabelPrintPage";

export default async function LabelPrintRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LabelPrintPage searchParams={await searchParams} />;
}
