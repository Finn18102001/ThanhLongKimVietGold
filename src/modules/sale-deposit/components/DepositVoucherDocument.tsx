import { formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { DEPOSIT_COMPANY } from "../company";
import { formatLegalDocNo } from "../labels";
import { viDateParts } from "../printDate";
import type { DepositSaleBundle } from "../types";
import { CheckMark, DepositGoodsTable, DottedFill, SignBlock } from "./printBits";

function depositDong(bundle: DepositSaleBundle): number {
  return bundle.payments[0]?.amountDong ?? bundle.paidDong;
}

/**
 * PHIẾU ĐẶT CỌC MUA VÀNG
 * Layout locked to PHIẾU ĐẶT CỌC MUA VÀNG.docx
 */
export function DepositVoucherDocument({ bundle }: { bundle: DepositSaleBundle }) {
  const extras = bundle.payload;
  const issued = viDateParts(bundle.issuedAt);
  const paidAt = viDateParts(bundle.payments[0]?.paidAt || bundle.issuedAt);
  const pickup = viDateParts(bundle.pickupDueAt);
  const deposit = depositDong(bundle);
  const remaining = Math.max(0, bundle.totalDong - deposit);
  const method = bundle.paymentMethod;
  const goldLocked = extras.gold_price_locked ?? bundle.depositPriceLocked;

  return (
    <article className="sale-deposit-print bg-white text-black">
      <p className="text-center font-bold uppercase" style={{ fontSize: "16pt", letterSpacing: "0.04em" }}>
        Phiếu đặt cọc mua vàng
      </p>
      <div className="flex items-baseline justify-between" style={{ marginTop: "2.5mm", fontSize: "12pt" }}>
        <p className="font-bold">Số: {formatLegalDocNo(bundle.depositSlipNo, "PDC")}</p>
        <p className="font-bold">
          Ngày: {issued.slash || "……/……/……"}
        </p>
      </div>

      <p className="font-bold uppercase" style={{ marginTop: "4mm" }}>
        1. Thông tin khách hàng
      </p>
      <DottedFill label="Họ và tên/Tên khách hàng:" value={bundle.customerName} />
      <DottedFill
        label="CCCD/MST:"
        value={bundle.customerCitizenId || bundle.customerTaxCode || ""}
      />
      <DottedFill label="Địa chỉ:" value={bundle.customerAddress} />
      <DottedFill label="Điện thoại:" value={bundle.customerPhone} />

      <p className="font-bold uppercase" style={{ marginTop: "4mm" }}>
        2. Thông tin đơn hàng
      </p>
      <DepositGoodsTable lines={bundle.lines} />
      <DottedFill
        label="Tổng giá trị đơn hàng tạm tính:"
        value={formatDongCompact(bundle.totalDong)}
        suffix="đồng"
      />
      <DottedFill
        label="Số tiền khách hàng đặt cọc:"
        value={formatDongCompact(deposit)}
        suffix="đồng"
      />
      <DottedFill label="Bằng chữ:" value={formatDongInWords(deposit)} />
      <DottedFill
        label="Số tiền còn phải thanh toán:"
        value={formatDongCompact(remaining)}
        suffix="đồng"
      />

      <p className="font-bold uppercase" style={{ marginTop: "4mm" }}>
        3. Hình thức thanh toán tiền đặt cọc
      </p>
      <p style={{ marginTop: "1.6mm" }}>
        <CheckMark on={method === "CASH"} label="Tiền mặt" />
        <CheckMark on={method === "TRANSFER"} label="Chuyển khoản" />
      </p>
      <DottedFill label="Ngày nhận tiền:" value={paidAt.slash} />
      <DottedFill
        label="Số chứng từ/Phiếu thu:"
        value={extras.receipt_no || bundle.depositSlipNo || bundle.invoiceNo || ""}
      />
      <DottedFill label="Nội dung chuyển khoản (nếu có):" value={extras.transfer_content} />

      <p className="font-bold uppercase" style={{ marginTop: "4mm" }}>
        4. Thời gian giao vàng
      </p>
      <DottedFill label="Thời gian dự kiến giao vàng:" value={pickup.slash || extras.delivery_to} />
      <DottedFill
        label="Địa điểm giao:"
        value={extras.delivery_place || bundle.depositDeliveryPlace || DEPOSIT_COMPANY.place}
      />
      <p style={{ marginTop: "1.8mm" }}>
        Giá vàng: <CheckMark on={goldLocked} label="Đã chốt" />
      </p>
      <p style={{ marginTop: "2mm", textAlign: "justify" }}>
        Phiếu này xác nhận việc Bên Bán đã nhận khoản tiền đặt cọc của khách hàng để thực hiện đơn hàng
        mua vàng nêu trên. Khoản tiền đặt cọc được cấn trừ vào giá trị giao dịch khi hai bên hoàn tất việc
        giao nhận và thanh toán theo thỏa thuận.
      </p>

      <div className="flex justify-between gap-3" style={{ marginTop: "8mm" }}>
        <SignBlock>Khách hàng</SignBlock>
        <SignBlock>Người lập phiếu</SignBlock>
        <SignBlock>Đại diện công ty</SignBlock>
      </div>
    </article>
  );
}
