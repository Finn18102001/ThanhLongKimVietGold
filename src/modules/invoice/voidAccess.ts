/** Emails allowed to void sale invoices (UI gate; RPC enforces the same list). */
export const INVOICE_VOID_EMAILS = [
  "thanglongkimviet@gmail.com",
  "tuananh18101@gmail.com",
] as const;

export function canVoidInvoiceEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return (INVOICE_VOID_EMAILS as readonly string[]).includes(normalized);
}
