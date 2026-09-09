/** Asia/Ho_Chi_Minh calendar parts from a server ISO timestamp (display only). */
export function viDateParts(isoDateTime: string | null | undefined): {
  day: string;
  month: string;
  year: string;
  slash: string;
} {
  if (!isoDateTime) return { day: "", month: "", year: "", slash: "" };
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return { day: "", month: "", year: "", slash: "" };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  return {
    day,
    month,
    year,
    slash: day && month && year ? `${day}/${month}/${year}` : "",
  };
}

export function viDateLongLine(isoDateTime: string | null | undefined): string {
  const { day, month, year } = viDateParts(isoDateTime);
  if (!day || !month || !year) return "Ngày …… tháng …… năm ……";
  return `Ngày ${day} tháng ${month} năm ${year}`;
}
