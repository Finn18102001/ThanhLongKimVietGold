export default function InventoryReturnPage() {
  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h1 className="text-[15px] font-semibold">Trả hàng nguồn hàng</h1>
      <p className="mt-2 max-w-xl text-[13px] text-[var(--tlkv-muted)]">
        Luồng trả hàng NCC sẽ giảm kho và điều chỉnh công nợ / khoản phải thu theo trạng thái thanh
        toán của phiếu nhập. Form thao tác đầy đủ sẽ bổ sung trên cùng schema công nợ nguồn hàng đã
        triển khai.
      </p>
    </section>
  );
}
