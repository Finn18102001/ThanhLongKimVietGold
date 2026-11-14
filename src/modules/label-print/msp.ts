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
