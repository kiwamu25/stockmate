export function formatUtcTextToLocal(text?: string): string {
  if (!text) return "-";

  const trimmed = text.trim();
  if (!trimmed) return "-";

  const hasTimezone = /[zZ]|[+\-]\d{2}:\d{2}$/.test(trimmed);
  const base = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const iso = hasTimezone ? base : `${base}Z`;
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return trimmed;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
