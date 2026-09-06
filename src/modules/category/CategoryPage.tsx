import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData } from "@/shared/auth/permissions";
import { listCategories } from "./actions";
import { CategoryDirectory } from "./CategoryDirectory";

export async function CategoryPage() {
  const session = await getPosSession();
  let initial: Awaited<ReturnType<typeof listCategories>> = [];
  try {
    initial = await listCategories();
  } catch {
    // Migration chưa apply
  }
  return (
    <CategoryDirectory
      initial={initial}
      canMutate={session ? canMutateAdminData(session.role) : false}
    />
  );
}
