/** Minimal RFC 5545 iCalendar generator (no external dependency). */

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
}

function fmt(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcal(events: ICalEvent[], name = "UNESWA Research Chain consultations"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UNESWA Research Chain//Consultations//EN",
    `X-WR-CALNAME:${esc(name)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(e.uid)}`,
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${fmt(e.startIso)}`,
      `DTEND:${fmt(e.endIso)}`,
      `SUMMARY:${esc(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
