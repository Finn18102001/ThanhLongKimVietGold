import { getPosSession } from "@/shared/auth/session";
import { createServerSupabase } from "@/shared/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/** Bare shell for deposit phôi — no admin chrome so print/PDF is document-only. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getPosSession();
  if (!session) redirect("/login");
  return <>{children}</>;
}
