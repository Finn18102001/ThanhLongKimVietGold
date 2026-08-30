/** Best-effort parse for VN CCCD QR payloads. Spec §23: no hard-coded format; verify before save. */
export type CccdQrPreview = {
  citizenId?: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  nationality?: string;
  address?: string;
  issueDate?: string;
  issuePlace?: string;
  raw: string;
};

function normalizeDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmy = trimmed.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return undefined;
}

function mapGender(value: string): CccdQrPreview["gender"] | undefined {
  const v = value.trim().toLowerCase();
  if (v === "nam" || v === "male" || v === "m") return "MALE";
  if (v === "nữ" || v === "nu" || v === "female" || v === "f") return "FEMALE";
  if (v) return "OTHER";
  return undefined;
}

/** Pipe / semicolon delimited payloads seen on some VN ID cards. */
function parseDelimited(raw: string): CccdQrPreview | null {
  const parts = raw.split(/[|;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const citizenId = parts.find((p) => /^\d{9,12}$/.test(p));
  if (!citizenId) return null;

  const preview: CccdQrPreview = { citizenId, raw };
  for (const part of parts) {
    if (part === citizenId) continue;
    const dob = normalizeDate(part);
    if (dob && !preview.dateOfBirth) {
      preview.dateOfBirth = dob;
      continue;
    }
    const gender = mapGender(part);
    if (gender && !preview.gender) {
      preview.gender = gender;
      continue;
    }
    if (/^[A-Za-zÀ-ỹ\s]{6,}$/.test(part) && !preview.fullName) {
      preview.fullName = part;
      continue;
    }
    if (part.length >= 8 && !preview.address) {
      preview.address = part;
    }
  }
  return preview;
}

export function parseCccdQrPayload(raw: string): CccdQrPreview | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const citizenId = String(json.citizen_id ?? json.citizenId ?? json.id ?? "").trim();
    if (!citizenId) return null;
    return {
      raw: text,
      citizenId,
      fullName: String(json.full_name ?? json.fullName ?? json.name ?? "").trim() || undefined,
      dateOfBirth: normalizeDate(String(json.date_of_birth ?? json.dob ?? "")),
      gender: mapGender(String(json.gender ?? "")),
      nationality: String(json.nationality ?? "").trim() || undefined,
      address: String(json.address ?? "").trim() || undefined,
      issueDate: normalizeDate(String(json.issue_date ?? json.citizen_id_issue_date ?? "")),
      issuePlace: String(json.issue_place ?? json.citizen_id_issue_place ?? "").trim() || undefined,
    };
  } catch {
    // not JSON
  }

  return parseDelimited(text);
}
