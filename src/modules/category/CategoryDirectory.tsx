"use client";

import { useState, useTransition } from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import {
  createCategory,
  deleteCategory,
  getCategory,
  searchAssignableSkus,
  updateCategory,
} from "./actions";
import { CategoryFormModal } from "./components/CategoryFormModal";
import type { CategoryDetail, CategoryRecord } from "./types";

export function CategoryDirectory({ initial }: { initial: CategoryRecord[] }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<CategoryDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function openEdit(id: string) {
    try {
      setEditing(await getCategory(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh mục");
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">Danh mục POS</h1>
          <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
            Nhóm SKU cho POS / kiểm kê. Không thay CRUD sản phẩm website.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
        >
          <Plus size={14} weight="bold" />
          Thêm danh mục
        </button>
      </div>

      {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

      <table className={`mt-4 w-full text-left text-[13px] ${pending ? "opacity-60" : ""}`}>
        <thead className="text-[12px] text-[var(--tlkv-muted)]">
          <tr className="border-b border-[var(--tlkv-line)]">
            <th className="py-2 font-medium">Tên</th>
            <th className="py-2 font-medium">Mô tả</th>
            <th className="py-2 font-medium">SP</th>
            <th className="py-2 font-medium">Trạng thái</th>
            <th className="py-2 font-medium">Thứ tự</th>
            <th className="py-2 font-medium">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-[var(--tlkv-muted)]">
                Chưa có danh mục POS. Tạo mới để gán SKU.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                <td className="py-3 font-medium">{row.name}</td>
                <td className="py-3 text-[var(--tlkv-muted)]">{row.description || "—"}</td>
                <td className="py-3">{row.productCount}</td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      row.status === "ACTIVE"
                        ? "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
                        : "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]"
                    }`}
                  >
                    {row.status === "ACTIVE" ? "Hoạt động" : "Ẩn"}
                  </span>
                </td>
                <td className="py-3">{row.displayOrder}</td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void openEdit(row.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                    >
                      <PencilSimple size={14} />
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await deleteCategory(row.id);
                            setRows((current) => current.filter((item) => item.id !== row.id));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Không xóa được");
                          }
                        })
                      }
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] text-[var(--tlkv-red)]"
                    >
                      <Trash size={14} />
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {creating ? (
        <CategoryFormModal
          title="Thêm danh mục"
          onClose={() => setCreating(false)}
          onSearchSkus={searchAssignableSkus}
          onSave={(input) =>
            startTransition(async () => {
              const created = await createCategory(input);
              setRows((current) => [
                ...current,
                {
                  id: created.id,
                  name: created.name,
                  description: created.description,
                  status: created.status,
                  displayOrder: created.displayOrder,
                  productCount: created.skus.length,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ]);
              setCreating(false);
            })
          }
        />
      ) : null}

      {editing ? (
        <CategoryFormModal
          title="Sửa danh mục"
          initial={editing}
          onClose={() => setEditing(null)}
          onSearchSkus={searchAssignableSkus}
          onSave={(input) =>
            startTransition(async () => {
              const updated = await updateCategory(editing.id, input);
              setRows((current) =>
                current.map((row) =>
                  row.id === editing.id
                    ? {
                        ...row,
                        name: updated.name,
                        description: updated.description,
                        status: updated.status,
                        displayOrder: updated.displayOrder,
                        productCount: updated.skus.length,
                      }
                    : row,
                ),
              );
              setEditing(null);
            })
          }
        />
      ) : null}
    </section>
  );
}
