import { searchForm02 } from "./actions";
import { Form02Directory } from "./Form02Directory";
import type { Form02ListPage } from "./types";

export async function Form02Page() {
  let initial: Form02ListPage = { items: [], total: 0, limit: 50, offset: 0 };
  try {
    initial = await searchForm02({ limit: 50, offset: 0 });
  } catch {
    // RPC chưa apply / chưa có quyền
  }
  return <Form02Directory initial={initial} />;
}
