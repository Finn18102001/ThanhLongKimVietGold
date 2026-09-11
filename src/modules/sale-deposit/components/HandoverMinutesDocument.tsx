import { formatDongCompact } from "@/shared/lib/money";
import { DEPOSIT_COMPANY } from "../company";
import { formatLegalDocNo } from "../labels";
import { viDateParts } from "../printDate";
import type { DepositSaleBundle } from "../types";
import { CheckMark, DepositGoodsTable, DottedFill, SignBlock } from "./printBits";

function depositDong(bundle: DepositSaleBundle): number {
  return bundle.payments[0]?.amountDong ?? bundle.paidDong;
}

/**
 * BIÊN BẢN GIAO NHẬN
 * Layout locked to BIÊN BẢN GIAO NHẬN.docx
 */
export function HandoverMinutesDocument({ bundle }: { bundle: DepositSaleBundle }) {
  const extras = bundle.payload;
  const issued = viDateParts(bundle.issuedAt);
  const nowParts = viDateParts(new Date().toISOString());
  const day = bundle.fulfillmentStatus === "FULFILLED" ? issued : nowParts;
  const agreement = viDateParts(bundle.issuedAt);
  const deposit = depositDong(bundle);
  const extraPaid = Math.max(0, bundle.paidDong - deposit);
  const remaining = bundle.remainingDong;
  const lastPay = bundle.payments[bundle.payments.length - 1];
  const restMethod = lastPay && lastPay !== bundle.payments[0] ? lastPay.paymentMethod : bundle.paymentMethod;
  const place = extras.place || extras.delivery_place || bundle.depositDeliveryPlace || DEPOSIT_COMPANY.place;

  return (
    <article className="sale-deposit-print bg-white text-black">
      <p className="text-center font-bold uppercase" style={{ fontSize: "16pt", letterSpacing: "0.04em" }}>
        Biên bản giao nhận
      </p>
      <p className="text-center font-bold" style={{ marginTop: "1.5mm", fontSize: "12pt" }}>
        Số: {formatLegalDocNo(bundle.deliveryReceiptNo, "BBGN")}
      </p>

      <p style={{ marginTop: "3.5mm" }}>
        Hôm nay, ngày {day.day || "……"} tháng {day.month || "……"} năm {day.year || "……"}, tại{" "}
        <span style={inlineDot}>{place}</span>, chúng tôi gồm:
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3mm" }}>
        Bên giao – Bên bán
      </p>
      <p className="font-bold" style={{ marginTop: "1.2mm" }}>
        {DEPOSIT_COMPANY.legalName}
      </p>
      <DottedFill label="Địa chỉ:" value={DEPOSIT_COMPANY.address} />
      <DottedFill label="MST:" value={DEPOSIT_COMPANY.taxCode} />
      <DottedFill label="Đại diện: Ông/Bà" value={extras.seller_representative} />
      <DottedFill label="Chức vụ:" value={extras.seller_title} />

      <p className="font-bold uppercase" style={{ marginTop: "3mm" }}>
        Bên nhận – Bên mua
      </p>
      <DottedFill label="Họ và tên:" value={bundle.customerName} />
      <DottedFill
        label="CCCD/MST:"
        value={bundle.customerCitizenId || bundle.customerTaxCode || ""}
      />
      <DottedFill label="Địa chỉ:" value={bundle.customerAddress} />
      <DottedFill label="Điện thoại:" value={bundle.customerPhone} />

      <p style={{ marginTop: "3mm" }}>
        Hai bên tiến hành giao nhận số vàng theo Thỏa thuận đặt cọc/Hợp đồng mua bán số{" "}
        <span style={inlineDot}>{formatLegalDocNo(bundle.depositAgreementNo, "TTĐC")}</span> ngày{" "}
        {agreement.slash || "……/……/……"} như sau:
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Chi tiết vàng giao nhận
      </p>
      <DepositGoodsTable lines={bundle.lines} amountHeader="Thành tiền" />

      <p style={{ marginTop: "2.5mm", textAlign: "justify" }}>
        Bên Mua xác nhận đã trực tiếp kiểm tra số vàng nêu trên và nhận đủ số lượng, chủng loại, trọng
        lượng theo thỏa thuận.
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        3. Tình hình thanh toán
      </p>
      <DottedFill
        label="Tổng giá trị vàng giao nhận:"
        value={formatDongCompact(bundle.totalDong)}
        suffix="đồng"
      />
      <DottedFill label="Số tiền đã đặt cọc:" value={formatDongCompact(deposit)} suffix="đồng" />
      <DottedFill
        label="Số tiền đã thanh toán trước (nếu có):"
        value={formatDongCompact(extraPaid)}
        suffix="đồng"
      />
      <DottedFill
        label="Số tiền còn phải thanh toán:"
        value={formatDongCompact(remaining)}
        suffix="đồng"
      />
      <p style={{ marginTop: "1.8mm" }}>Phương thức thanh toán phần còn lại:</p>
      <p style={{ marginTop: "1.2mm" }}>
        <CheckMark on={restMethod === "CASH"} label="Tiền mặt" />
        <CheckMark on={restMethod === "TRANSFER"} label="Chuyển khoản" />
        <CheckMark
          on={restMethod !== "CASH" && restMethod !== "TRANSFER"}
          label="Hình thức khác:"
        />
        {restMethod !== "CASH" && restMethod !== "TRANSFER" ? (
          <span style={inlineDot}>{extras.payment_other || "Thẻ"}</span>
        ) : extras.payment_other ? (
          <span style={inlineDot}>{extras.payment_other}</span>
        ) : null}
      </p>
      {extras.handover_note ? (
        <DottedFill label="Ghi nhận khác:" value={extras.handover_note} />
      ) : null}

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        4. Xác nhận giao nhận
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Bên Giao đã giao và Bên Nhận đã nhận đủ số vàng nêu tại Biên bản này.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Bên Mua xác nhận đã kiểm tra hàng hóa tại thời điểm nhận và không có ý kiến gì về số lượng,
        chủng loại, trọng lượng và tình trạng vàng được giao, trừ các nội dung được ghi nhận cụ thể tại
        Biên bản này.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Biên bản được lập thành 02 bản có giá trị như nhau, mỗi bên giữ 01 bản để làm căn cứ thực hiện
        và lưu hồ sơ.
      </p>

      <div className="flex justify-between gap-6" style={{ marginTop: "8mm" }}>
        <SignBlock>Đại diện bên nhận – khách hàng</SignBlock>
        <SignBlock>Đại diện bên giao – công ty</SignBlock>
      </div>
    </article>
  );
}

const inlineDot = {
  borderBottom: "1px dotted #000",
  padding: "0 2mm 1px",
  display: "inline-block" as const,
  minWidth: "28mm",
};
