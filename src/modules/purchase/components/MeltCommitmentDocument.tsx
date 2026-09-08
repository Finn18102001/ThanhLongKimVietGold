"use client";

import { formatViDateOnly } from "@/shared/lib/datetime";
import { formatChi } from "../labels";
import type { BuyDetail } from "../types";

/**
 * PHIẾU CAM KẾT NẤU BÁN SẢN PHẨM
 * Content aligned to PHIẾU CAM KẾT NẤU SP - MỚI 2026 final.docx
 */
export function MeltCommitmentDocument({ buy }: { buy: BuyDetail }) {
  const issued = buy.meltingStartedAt
    ? formatViDateOnly(buy.meltingStartedAt)
    : buy.completedAt
      ? formatViDateOnly(buy.completedAt)
      : formatViDateOnly(new Date().toISOString());
  const staff = buy.actorEmail.split("@")[0] || buy.actorEmail;
  const docNo = buy.meltCommitmentNo || buy.buyNo;

  return (
    <article className="purchase-print mx-auto w-full max-w-[190mm] bg-white px-6 py-5 text-[#1f1f1f]">
      <BrandHeader />
      <header className="mt-3 border-b-2 border-[var(--tlkv-red)] pb-3 text-center">
        <h1 className="text-[16px] font-bold uppercase">Phiếu cam kết nấu bán sản phẩm</h1>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Số {docNo}
          {issued ? ` · Ngày ${issued}` : ""}
        </p>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
        <Field label="Họ và tên KH" value={buy.customerName} />
        <Field label="CCCD" value={buy.customerCitizenId || "-"} />
        <Field label="Số điện thoại" value={buy.customerPhone || "-"} />
        <Field label="Địa chỉ" value={buy.customerAddress || "-"} />
      </section>

      <p className="mt-4 text-[12px] font-semibold underline">1. Thông tin sản phẩm</p>
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#f8f1e7] text-center">
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1.5 font-semibold" rowSpan={2}>
              STT
            </th>
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1.5 font-semibold" rowSpan={2}>
              Tên sản phẩm
            </th>
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1.5 font-semibold" rowSpan={2}>
              Số lượng
            </th>
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1.5 font-semibold" colSpan={2}>
              Khối lượng
            </th>
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1.5 font-semibold" rowSpan={2}>
              Mô tả sản phẩm
              <br />
              <span className="font-normal">(Tình trạng, kiểu chủng…)</span>
            </th>
          </tr>
          <tr className="bg-[#f8f1e7] text-center">
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1 font-semibold">Trước nấu</th>
            <th className="border border-[var(--tlkv-line)] px-1.5 py-1 font-semibold">Sau nấu</th>
          </tr>
        </thead>
        <tbody>
          {buy.items.map((item, index) => {
            const before = item.weightBeforeChi > 0 ? item.weightBeforeChi : item.weightChi;
            const after = item.weightAfterChi;
            const desc = [item.goldAge, item.goldType, item.brandName].filter(Boolean).join(" · ");
            return (
              <tr key={item.id}>
                <td className="border border-[var(--tlkv-line)] px-1.5 py-1.5 text-center">
                  {index + 1}
                </td>
                <td className="border border-[var(--tlkv-line)] px-1.5 py-1.5 text-left">
                  {item.productName}
                </td>
                <td className="border border-[var(--tlkv-line)] px-1.5 py-1.5 text-right tabular-nums">
                  {item.quantity}
                </td>
                <td className="border border-[var(--tlkv-line)] px-1.5 py-1.5 text-right tabular-nums">
                  {formatChi(before)}
                </td>
                <td className="border border-[var(--tlkv-line)] px-1.5 py-1.5 text-right tabular-nums">
                  {after != null ? formatChi(after) : ""}
                </td>
                <td className="border border-[var(--tlkv-line)] px-1.5 py-1.5 text-left">
                  {desc || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="mt-4 text-[11px] leading-relaxed">
        <p className="font-semibold underline">2. Chính sách giao dịch áp dụng</p>
        <p className="mt-1">
          Đối với hàng hóa không phải mua của công ty (Không có dấu và Giấy đảm bảo vàng của Thăng
          Long Kim Việt)
        </p>
        <p className="mt-2 font-medium">
          2.1. Đối với hàng trọng lượng (trang sức vàng tây/vàng ta không gắn đá):
        </p>
        <p className="mt-0.5 pl-2">
          bắt buộc nấu chảy → thử tuổi → mua theo giá vàng thị trường niêm yết tại cửa hàng vào thời
          điểm giao dịch.
        </p>
        <p className="mt-2 font-medium">2.2. Đối với Hàng có gắn đá ngọc, kim cương:</p>
        <p className="mt-0.5 pl-2">
          Khách hàng mang sản phẩm bảo hành để bóc tách đá ngọc, kim cương ra khỏi vàng, cụ thể:
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-6">
          <li>
            Đối với vàng: Phải nấu chảy, thử tuổi để tiến hành mua theo tuổi vàng và giá vàng thị
            trường tại thời điểm giao dịch (nếu hàm lượng vàng đạt).
          </li>
          <li>
            Đối với đá ngọc, kim cương: Phải kiểm định lại chất lượng tại các trung tâm kiểm định được
            cấp phép. Nếu đạt chuẩn thì Công ty mua theo giá thỏa thuận giữa Hai bên tại thời điểm
            giao dịch.
          </li>
        </ul>
        <p className="mt-2 font-semibold">***Lưu ý: Tất cả các sản phẩm sau khi nấu và thử tuổi:</p>
        <ul className="mt-1 list-disc space-y-1 pl-6">
          <li>
            Sản phẩm có hàm lượng vàng từ 92% trở xuống công ty sẽ mua lại theo như quy chế hiện hành
          </li>
          <li>Sản phẩm có hàm lượng vàng thấp hơn 10% công ty sẽ không mua lại</li>
        </ul>
      </section>

      <section className="mt-4 text-[11px] leading-relaxed">
        <p className="font-semibold underline">3. Cam kết của khách hàng</p>
        <p className="mt-1">
          Tôi đồng ý nấu hỏng sản phẩm để tiến hành mua bán theo Quy chế và Chính sách giao dịch áp
          dụng hiện hành của Công ty TNHH Vàng Bạc Thăng Long Kim Việt.
        </p>
        <p className="mt-1">
          Tôi cam kết chịu mọi trách nhiệm liên quan đến sản phẩm ban đầu và sau nấu, không có bất kỳ
          khiếu nại nào với Công ty TNHH Vàng Bạc Thăng Long Kim Việt.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-6 text-center text-[12px]">
        <SignBox title="Nhân viên mua hàng" name={staff} />
        <SignBox title="Xác nhận khách hàng" name={buy.customerName} />
      </section>
    </article>
  );
}

function BrandHeader() {
  return (
    <div className="text-center">
      <p className="text-[13px] font-bold tracking-[0.06em] text-[var(--tlkv-red)]">
        THĂNG LONG KIM VIỆT
      </p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--tlkv-text)]">
        Giữ vàng - Giữ phúc - Giữ niềm tin
      </p>
      <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
        Địa chỉ: 322 Nguyễn Trãi, Phường Đại Mỗ, TP.HN · Hotline: 099.568.2568
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-[var(--tlkv-muted)]">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function SignBox({ title, name }: { title: string; name: string }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p className="mt-8 text-[11px] text-[var(--tlkv-muted)]">(Ký tên)</p>
      <p className="mt-1 min-h-[18px] font-medium">{name}</p>
    </div>
  );
}
