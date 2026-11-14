/** Compose MSP: PREFIX-###### (hyphen). Empty type → serial only. Keep legacy MSPs without rewrite. */
export function composeLabelMsp(typeCode: string, serialNo: string): string {
  const type = String(typeCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/-+$/g, "");
  const serial = String(serialNo ?? "").trim();
  if (!serial) return type;
  if (!type) return serial;
  return `${type}-${serial}`;
}

/** Mode mã có sẵn: ghép type + số SP (chữ+số), không hyphen / không sequence. VD CHARM + 766HHH → CHARM766HHH. */
export function composePreassignedLabelCode(typeCode: string, productNumber: string): string {
  const type = String(typeCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const product = String(productNumber ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!type || !product) return type || product;
  return `${type}${product}`;
}

export function normalizeLabelCodePart(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}
