import { ReceiveForm } from "./components/ReceiveForm";
import { listStock } from "./query";

export async function ReceivePage() {
  const rows = await listStock();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Kho hàng</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Nhập hàng</p>
      </div>
      <ReceiveForm rows={rows} />
    </div>
  );
}
