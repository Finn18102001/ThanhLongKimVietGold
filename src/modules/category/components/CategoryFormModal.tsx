"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import type { AssignableSku, CategoryDetail } from "../types";

export function CategoryFormModal({
  title,
  initial,
  onClose,
  onSearchSkus,
  onSave,
}: {
  title: string;
  initial?: CategoryDetail;
  onClose: () => void;
  onSearchSkus: (query: string) => Promise<AssignableSku[]>;
  onSave: (input: {
    name: string;
    description?: string;
    status: "ACTIVE" | "INACTIVE";
    displayOrder: number;
    skuIds: string[];
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(initial?.status ?? "ACTIVE");
  const [displayOrder, setDisplayOrder] = useState(initial?.displayOrder ?? 0);
  const [selected, setSelected] = useState<string[]>(initial?.skus.map((sku) => sku.skuId) ?? []);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AssignableSku[]>([]);

  useEffect(() => {
    void onSearchSkus(query).then(setOptions);
  }, [query, onSearchSkus]);

  return (
    <Modal
      title={title}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px]">
            Hủy
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || undefined,
                status,
                displayOrder,
                skuIds: selected,
              })
            }
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Lưu
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-[13px]">
          Tên danh mục
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
          />
        </label>
        <label className="text-[13px]">
          Thứ tự hiển thị
          <input
            type="number"
            value={displayOrder}
            onChange={(event) => setDisplayOrder(Number(event.target.value))}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
          />
        </label>
        <label className="text-[13px] md:col-span-2">
          Mô tả
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2"
          />
        </label>
        <label className="text-[13px]">
          Trạng thái
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "ACTIVE" | "INACTIVE")}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
          >
            <option value="ACTIVE">Hoạt động</option>
            <option value="INACTIVE">Ẩn</option>
          </select>
        </label>
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-semibold">Gán sản phẩm (SKU POS)</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm SKU..."
          className="mt-2 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--tlkv-line)]">
          {options.map((sku) => {
            const checked = selected.includes(sku.skuId);
            return (
              <label
                key={sku.skuId}
                className="flex cursor-pointer items-center gap-2 border-b border-[var(--tlkv-line)] px-3 py-2 text-[13px] last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelected((current) =>
                      checked
                        ? current.filter((id) => id !== sku.skuId)
                        : [...current, sku.skuId],
                    )
                  }
                />
                <span className="font-medium">{sku.name}</span>
                <span className="text-[12px] text-[var(--tlkv-muted)]">{sku.sku}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">Đã chọn {selected.length} SKU</p>
      </div>
    </Modal>
  );
}
