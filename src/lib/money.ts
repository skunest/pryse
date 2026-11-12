/** Formats cents as South African rand, e.g. 303750 -> "R 3 037.50". */
export function rand(cents: number | bigint | null | undefined) {
  const v = Number(cents ?? 0) / 100;
  const neg = v < 0;
  const [whole, dec] = Math.abs(v).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}R ${grouped}.${dec}`;
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return dt.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-ZA", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Africa/Johannesburg", timeZoneName: "short",
  });
}
