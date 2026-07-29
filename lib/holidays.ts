export const HOLIDAY_RANGES = [
  { start: "2026-05-22", end: "2026-05-25", label: "May 22–25, 2026" },
  { start: "2026-07-03", end: "2026-07-05", label: "Jul 3–5, 2026" },
  { start: "2026-09-04", end: "2026-09-07", label: "Sep 4–7, 2026" },
  { start: "2026-11-25", end: "2026-11-29", label: "Nov 25–29, 2026" },
  { start: "2026-12-24", end: "2026-12-27", label: "Dec 24–27, 2026" },
  { start: "2026-12-31", end: "2027-01-03", label: "Dec 31, 2026 – Jan 3, 2027" },
] as const;

export const HOLIDAY_FEE_PER_DAY = 10;

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isHolidayDate(dateStr: string): boolean {
  const date = parseDateOnly(dateStr);
  return HOLIDAY_RANGES.some((range) => {
    const start = parseDateOnly(range.start);
    const end = parseDateOnly(range.end);
    return date >= start && date <= end;
  });
}

/** Calendar days from drop-off through pick-up (inclusive) that trigger holiday rate. */
export function countHolidayDaysInStay(
  dropoffDate: string,
  pickupDate: string
): { holidayDays: number; holidayDates: string[] } {
  const start = parseDateOnly(dropoffDate);
  const end = parseDateOnly(pickupDate);
  if (end < start) {
    return { holidayDays: 0, holidayDates: [] };
  }

  const holidayDates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = toDateOnlyString(cursor);
    if (isHolidayDate(iso)) {
      holidayDates.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { holidayDays: holidayDates.length, holidayDates };
}

export function formatHolidayRangesForDisplay(): string {
  return HOLIDAY_RANGES.map((range) => range.label).join("; ");
}
