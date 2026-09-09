export const HOLIDAY_FEE_PER_DAY = 10;
export const CHRISTMAS_HOLIDAY_FEE_PER_DAY = 15;

type HolidayRange = {
  start: string;
  end: string;
  label: string;
  feePerDay?: number;
};

export const HOLIDAY_RANGES: readonly HolidayRange[] = [
  { start: "2026-05-22", end: "2026-05-25", label: "May 22–25, 2026" },
  { start: "2026-07-03", end: "2026-07-05", label: "Jul 3–5, 2026" },
  { start: "2026-09-04", end: "2026-09-07", label: "Sep 4–7, 2026" },
  { start: "2026-11-25", end: "2026-11-29", label: "Nov 25–29, 2026" },
  { start: "2026-12-24", end: "2026-12-27", label: "Dec 24–27, 2026" },
  { start: "2026-12-31", end: "2027-01-03", label: "Dec 31, 2026 – Jan 3, 2027" },
  // Jan 1–3, 2027 is already covered by the preceding New Year range.
  { start: "2027-01-15", end: "2027-01-18", label: "Jan 15–18, 2027" },
  { start: "2027-02-12", end: "2027-02-15", label: "Feb 12–15, 2027" },
  { start: "2027-05-28", end: "2027-05-31", label: "May 28–31, 2027" },
  { start: "2027-06-18", end: "2027-06-20", label: "Jun 18–20, 2027" },
  { start: "2027-07-02", end: "2027-07-05", label: "Jul 2–5, 2027" },
  { start: "2027-09-03", end: "2027-09-06", label: "Sep 3–6, 2027" },
  { start: "2027-11-25", end: "2027-11-28", label: "Nov 25–28, 2027" },
  {
    start: "2027-12-24",
    end: "2028-01-03",
    label: "Dec 24, 2027 – Jan 3, 2028 (continuous, including Dec 28–30)",
    feePerDay: CHRISTMAS_HOLIDAY_FEE_PER_DAY,
  },
];

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

export function getHolidayFeeForDate(dateStr: string): number {
  const date = parseDateOnly(dateStr);
  return HOLIDAY_RANGES.reduce((fee, range) => {
    const start = parseDateOnly(range.start);
    const end = parseDateOnly(range.end);
    return date >= start && date <= end
      ? Math.max(fee, range.feePerDay ?? HOLIDAY_FEE_PER_DAY)
      : fee;
  }, 0);
}

export function isHolidayDate(dateStr: string): boolean {
  return getHolidayFeeForDate(dateStr) > 0;
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
  return HOLIDAY_RANGES.map((range) =>
    `${range.label} (+$${range.feePerDay ?? HOLIDAY_FEE_PER_DAY}/day)`
  ).join("; ");
}
