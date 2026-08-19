import { listCategories } from "./actions";
import { CategoryDirectory } from "./CategoryDirectory";

export async function CategoryPage() {
  let initial: Awaited<ReturnType<typeof listCategories>> = [];
  try {
    initial = await listCategories();
  } catch {
    // Migration chưa apply
  }
  return <CategoryDirectory initial={initial} />;
}
