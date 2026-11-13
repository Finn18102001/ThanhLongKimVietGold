import type { TaxonomyOverview, TaxonomyRow } from "./types";

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]"
      }`}
    >
      {active ? "Đang dùng" : "Ngừng dùng"}
    </span>
  );
}

function TaxonomyTable({
  title,
  rows,
  linkedLabel,
}: {
  title: string;
  rows: TaxonomyRow[];
  linkedLabel?: string;
}) {
  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="text-[15px] font-semibold">
        {title} <span className="text-[13px] font-normal text-[var(--tlkv-muted)]">({rows.length})</span>
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Tên</th>
              {linkedLabel ? <th className="py-2 pr-3 font-medium">{linkedLabel}</th> : null}
              <th className="py-2 pr-3 text-right font-medium">Sản phẩm</th>
              <th className="py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={linkedLabel ? 4 : 3} className="py-6 text-[var(--tlkv-muted)]">
                  Chưa có dữ liệu.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                  <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                  {linkedLabel ? (
                    <td className="py-2.5 pr-3">
                      {row.linked.length === 0 ? (
                        <span className="text-[var(--tlkv-muted)]">Chưa liên kết</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.linked.map((name) => (
                            <span
                              key={name}
                              className="rounded-full bg-[var(--tlkv-bg)] px-2 py-0.5 text-[12px] whitespace-nowrap"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  ) : null}
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.productCount}</td>
                  <td className="py-2.5">
                    <StatusBadge active={row.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CatalogTaxonomyView({ overview }: { overview: TaxonomyOverview }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Danh mục</h1>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Thương hiệu, danh mục và loại sản phẩm dùng chung với website. Màn này chỉ xem; thêm, sửa,
          liên kết ở trang quản trị website (/admin).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TaxonomyTable title="Thương hiệu" rows={overview.brands} linkedLabel="Danh mục liên kết" />
        <TaxonomyTable title="Danh mục" rows={overview.categories} linkedLabel="Thương hiệu sử dụng" />
      </div>
      <TaxonomyTable title="Loại sản phẩm" rows={overview.productTypes} />
    </div>
  );
}
