/**
 * CCCD QR parse for desk scanners (DP8280 USB-KBW).
 * Confirmed pipe format (preserve empty slots — never filter(Boolean)):
 *   CCCD|CMND_cũ|Họ tên|DDMMYYYY|Giới tính|Địa chỉ|Ngày cấp|…
 * Sample:
 *   038201019948||Nguyễn Tuấn Anh|18102001|Nam|Thôn Yên Thịnh, Ngọc Trạo, Thanh Hoá|29092026||||
 */

export type CccdQrGender = "MALE" | "FEMALE";

export type CccdQrParseSuccess = {
  ok: true;
  citizenId: string;
  /** Old CMND slot (fields[1]); may be empty — form may have no field for this. */
  oldIdNumber: string;
  fullName: string;
  /** ISO yyyy-mm-dd for ViDateField / BE. */
  dateOfBirthIso: string;
  gender: CccdQrGender;
  address: string;
  /** ISO yyyy-mm-dd — Ngày cấp CCCD (fields[6]). Rỗng nếu QR không có ngày cấp. */
  issueDateIso: string;
  raw: string;
};

export type CccdQrParseFailure = {
  ok: false;
  message: string;
  raw: string;
};

export type CccdQrParseResult = CccdQrParseSuccess | CccdQrParseFailure;

/** DDMMYYYY → yyyy-mm-dd; null if invalid calendar date (no auto-correct). */
export function parseCccdCompactDate(value: string): string | null {
  const raw = value.trim();
  if (!/^\d{8}$/.test(raw)) return null;
  const dd = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(2, 4));
  const yyyy = Number(raw.slice(4, 8));
  if (yyyy < 1900 || yyyy > 2100) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    dt.getUTCFullYear() !== yyyy ||
    dt.getUTCMonth() !== mm - 1 ||
    dt.getUTCDate() !== dd
  ) {
    return null;
  }
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Display helper: ISO → dd/mm/yyyy (empty if invalid). */
export function formatIsoToViDate(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function mapGenderStrict(value: string): CccdQrGender | null {
  const v = value.trim().toLowerCase();
  if (v === "nam" || v === "male" || v === "m") return "MALE";
  if (v === "nữ" || v === "nu" || v === "female" || v === "f") return "FEMALE";
  return null;
}

/**
 * Parse CCCD QR wedge payload. Index-stable split on `|`.
 * Does not invent fields; does not map CCCD → phone.
 */
export function parseCccdQrPayload(rawInput: string): CccdQrParseResult {
  const raw = String(rawInput ?? "").trim();
  if (!raw) {
    return { ok: false, message: "Chưa có dữ liệu QR. Focus ô quét rồi quét lại thẻ CCCD.", raw };
  }

  // Keep empty slots — do not filter(Boolean).
  const fields = raw.split("|").map((part) => part.trim());

  if (fields.length < 7) {
    return {
      ok: false,
      message:
        "Chuỗi QR CCCD không đủ trường (cần ít nhất 7 phần tách bởi |). Quét lại hoặc nhập tay.",
      raw,
    };
  }

  const citizenId = fields[0] ?? "";
  const oldIdNumber = fields[1] ?? "";
  const fullName = fields[2] ?? "";
  const dobRaw = fields[3] ?? "";
  const genderRaw = fields[4] ?? "";
  const address = fields[5] ?? "";
  const issueRaw = fields[6] ?? "";

  if (!/^\d{12}$/.test(citizenId)) {
    return {
      ok: false,
      message: "Số CCCD trên QR phải đúng 12 chữ số (không gán vào SĐT). Quét lại thẻ.",
      raw,
    };
  }

  if (!fullName) {
    return {
      ok: false,
      message: "QR thiếu họ và tên. Không autofill — quét lại hoặc nhập tay.",
      raw,
    };
  }

  const dateOfBirthIso = parseCccdCompactDate(dobRaw);
  if (!dateOfBirthIso) {
    return {
      ok: false,
      message: `Ngày sinh QR không hợp lệ («${dobRaw}»). Không autofill lệch vị trí.`,
      raw,
    };
  }

  const gender = mapGenderStrict(genderRaw);
  if (!gender) {
    return {
      ok: false,
      message: `Giới tính QR không nhận diện được («${genderRaw}»). Chỉ chấp nhận Nam/Nữ.`,
      raw,
    };
  }

  if (!address) {
    return {
      ok: false,
      message: "QR thiếu địa chỉ. Không autofill — quét lại hoặc nhập tay.",
      raw,
    };
  }

  // Ngày cấp: trống → bỏ qua (vẫn autofill các trường khác). Có giá trị sai → từ chối cả chuỗi.
  let issueDateIso = "";
  if (issueRaw) {
    const parsedIssue = parseCccdCompactDate(issueRaw);
    if (!parsedIssue) {
      return {
        ok: false,
        message: `Ngày cấp CCCD trên QR không hợp lệ («${issueRaw}»). Không autofill lệch vị trí.`,
        raw,
      };
    }
    issueDateIso = parsedIssue;
  }

  return {
    ok: true,
    citizenId,
    oldIdNumber,
    fullName,
    dateOfBirthIso,
    gender,
    address,
    issueDateIso,
    raw,
  };
}
