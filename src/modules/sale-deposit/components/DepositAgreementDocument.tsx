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
 * THỎA THUẬN ĐẶT CỌC MUA BÁN VÀNG
 * Layout locked to THỎA THUẬN ĐẶT CỌC MUA BÁN VÀNG.docx
 * Page A4, lề 25.4mm (Word 1440 twips), Times New Roman.
 */
export function DepositAgreementDocument({ bundle }: { bundle: DepositSaleBundle }) {
  const extras = bundle.payload;
  const issued = viDateParts(bundle.issuedAt);
  const pickup = viDateParts(bundle.pickupDueAt);
  const deposit = depositDong(bundle);
  const remaining = Math.max(0, bundle.totalDong - deposit);
  const method = bundle.paymentMethod;
  const place = extras.place || bundle.depositDeliveryPlace || DEPOSIT_COMPANY.place;
  const from = extras.delivery_from || pickup.slash;
  const to = extras.delivery_to || pickup.slash;
  const priceLocked = extras.price_locked ?? bundle.depositPriceLocked;

  return (
    <article className="sale-deposit-print bg-white text-black">
      <p className="text-center font-bold uppercase" style={{ fontSize: "16pt", letterSpacing: "0.04em" }}>
        Thỏa thuận đặt cọc mua bán vàng
      </p>
      <p className="text-center font-bold" style={{ marginTop: "1.5mm", fontSize: "12pt" }}>
        Số: {formatLegalDocNo(bundle.depositAgreementNo, "TTĐC")}
      </p>

      <p style={{ marginTop: "3.5mm" }}>
        Hôm nay, ngày {issued.day || "……"} tháng {issued.month || "……"} năm {issued.year || "……"}, tại{" "}
        <span style={inlineDot}>{place}</span>, chúng tôi gồm:
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3mm" }}>
        Bên bán: {DEPOSIT_COMPANY.legalName}
      </p>
      <DottedFill label="Mã số thuế:" value={DEPOSIT_COMPANY.taxCode} />
      <DottedFill label="Địa chỉ:" value={DEPOSIT_COMPANY.address} />
      <DottedFill label="Điện thoại:" value={DEPOSIT_COMPANY.phone} />
      <DottedFill label="Đại diện: Ông/Bà" value={extras.seller_representative} />
      <DottedFill label="Chức vụ:" value={extras.seller_title} />
      <DottedFill label="Tài khoản số:" value={extras.seller_bank_account} />
      <DottedFill label="Ngân hàng:" value={extras.seller_bank_name} />
      <p className="font-bold" style={{ marginTop: "1.2mm" }}>
        Sau đây gọi là “Bên Bán”.
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3mm" }}>
        Bên mua:
      </p>
      <DottedFill label="Họ và tên cá nhân/Tên tổ chức:" value={bundle.customerName} />
      <DottedFill
        label="CCCD/MST:"
        value={bundle.customerCitizenId || bundle.customerTaxCode || ""}
      />
      <DottedFill label="Địa chỉ:" value={bundle.customerAddress} />
      <DottedFill label="Điện thoại:" value={bundle.customerPhone} />
      <DottedFill label="Đại diện (nếu là tổ chức):" value={extras.buyer_representative} />
      <DottedFill label="Chức vụ:" value={extras.buyer_title} />
      <p className="font-bold" style={{ marginTop: "1.2mm" }}>
        Sau đây gọi là “Bên Mua”.
      </p>

      <p style={{ marginTop: "3mm" }}>
        Hai bên thống nhất ký Thỏa thuận đặt cọc mua bán vàng với các nội dung sau:
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3mm" }}>
        Điều 1. Nội dung đặt cọc
      </p>
      <p style={{ marginTop: "1.2mm" }}>
        Bên Mua đặt cọc cho Bên Bán để thực hiện việc mua vàng theo thông tin sau:
      </p>
      <DepositGoodsTable lines={bundle.lines} />
      <DottedFill
        label="Tổng giá trị giao dịch dự kiến:"
        value={formatDongCompact(bundle.totalDong)}
        suffix="đồng."
      />
      <DottedFill label="Số tiền đặt cọc:" value={formatDongCompact(deposit)} suffix="đồng." />
      <DottedFill label="Bằng chữ:" value={formatDongInWords(deposit)} />
      <DottedFill
        label="Số tiền còn phải thanh toán khi nhận vàng:"
        value={formatDongCompact(remaining)}
        suffix="đồng."
      />
      <p style={{ marginTop: "1.8mm" }}>
        Giá bán được xác định theo: <CheckMark on={priceLocked} label="Giá đã chốt tại thời điểm ký Thỏa thuận." />
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Điều 2. Mục đích và thời hạn đặt cọc
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Khoản tiền Bên Mua chuyển/giao cho Bên Bán là tiền đặt cọc để bảo đảm việc thực hiện giao dịch
        mua bán vàng theo Thỏa thuận này.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Thời hạn giao vàng dự kiến: từ ngày {from || "……/……/……"} đến ngày {to || "……/……/……"}.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Trường hợp thời điểm giao vàng thay đổi do nguồn cung, thời gian nhận hàng từ nhà cung cấp hoặc
        nguyên nhân khách quan khác, Bên Bán thông báo cho Bên Mua để hai bên thống nhất thời gian giao
        hàng mới.
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Điều 3. Thanh toán và giao nhận
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Bên Mua thanh toán tiền đặt cọc bằng:{" "}
        <CheckMark on={method === "CASH"} label="Tiền mặt" />
        <CheckMark on={method === "TRANSFER"} label="Chuyển khoản" />
        <CheckMark on={method !== "CASH" && method !== "TRANSFER"} label="Hình thức khác:" />
        {method !== "CASH" && method !== "TRANSFER" ? (
          <span style={inlineDot}>{extras.payment_other || "Thẻ"}</span>
        ) : extras.payment_other ? (
          <span style={inlineDot}>{extras.payment_other}</span>
        ) : null}
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Phần tiền còn lại được Bên Mua thanh toán trước hoặc tại thời điểm nhận vàng, trừ trường hợp hai
        bên có thỏa thuận khác bằng văn bản.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Khi giao vàng, hai bên lập Biên bản giao nhận vàng làm căn cứ xác nhận việc giao nhận thực tế.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Bên Mua có trách nhiệm kiểm tra chủng loại, trọng lượng, số lượng, đặc điểm nhận diện của vàng và
        ký xác nhận khi nhận hàng.
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Điều 4. Xử lý tiền đặt cọc
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Trường hợp giao dịch được thực hiện đầy đủ, tiền đặt cọc được cấn trừ vào tổng số tiền Bên Mua
        phải thanh toán.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Trường hợp Bên Mua đơn phương hủy giao dịch không do lỗi của Bên Bán, khoản tiền đặt cọc được xử
        lý theo thỏa thuận của hai bên và quy định pháp luật có liên quan.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Trường hợp Bên Bán từ chối thực hiện giao dịch không do lỗi của Bên Mua, việc xử lý tiền đặt cọc
        thực hiện theo thỏa thuận này và quy định pháp luật.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Trường hợp phát sinh sự kiện khách quan ảnh hưởng đến việc cung cấp/giao vàng, hai bên ưu tiên
        thỏa thuận phương án xử lý, bao gồm gia hạn thời gian giao hàng, điều chỉnh giao dịch hoặc hoàn
        trả tiền theo thỏa thuận.
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Điều 5. Chứng từ giao dịch
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Bên Bán có trách nhiệm cung cấp cho Bên Mua các chứng từ liên quan đến giao dịch theo quy định và
        chính sách của Công ty, bao gồm:
      </p>
      <p style={{ marginTop: "1mm", paddingLeft: "6mm" }}>Phiếu đặt cọc;</p>
      <p style={{ paddingLeft: "6mm" }}>Chứng từ thu tiền đặt cọc;</p>
      <p style={{ paddingLeft: "6mm" }}>Biên bản giao nhận vàng;</p>
      <p style={{ paddingLeft: "6mm" }}>Hóa đơn GTGT.</p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Điều 6. Cam kết của các bên
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Hai bên cam kết các thông tin cung cấp là đúng sự thật, tự nguyện ký Thỏa thuận và thực hiện đúng
        các nội dung đã thống nhất.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Mọi sửa đổi, bổ sung Thỏa thuận này phải được hai bên thống nhất và lập thành văn bản.
      </p>

      <p className="font-bold uppercase" style={{ marginTop: "3.5mm" }}>
        Điều 7. Hiệu lực thỏa thuận
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Thỏa thuận có hiệu lực kể từ ngày ký và chấm dứt khi hai bên hoàn thành toàn bộ nghĩa vụ liên quan
        đến giao dịch.
      </p>
      <p style={{ marginTop: "1.4mm" }}>
        Thỏa thuận được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.
      </p>

      <div className="flex justify-between gap-6" style={{ marginTop: "8mm" }}>
        <SignBlock>Đại diện bên mua</SignBlock>
        <SignBlock>Đại diện bên bán</SignBlock>
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
