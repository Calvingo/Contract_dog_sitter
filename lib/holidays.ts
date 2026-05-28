/** Summer holiday season — applies every year, inclusive */
export const HOLIDAY_SEASON = {
  startMonth: 6,
  startDay: 15,
  endMonth: 9,
  endDay: 1,
  label: "Jun 15 – Sep 1",
};

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

function monthDayValue(month: number, day: number): number {
  return month * 100 + day;
}

export function isHolidayDate(dateStr: string): boolean {
  const date = parseDateOnly(dateStr);
  const current = monthDayValue(date.getMonth() + 1, date.getDate());
  const start = monthDayValue(HOLIDAY_SEASON.startMonth, HOLIDAY_SEASON.startDay);
  const end = monthDayValue(HOLIDAY_SEASON.endMonth, HOLIDAY_SEASON.endDay);
  return current >= start && current <= end;
}

/** Calendar days from drop-off through pick-up (inclusive) that fall on a holiday */
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
  return `${HOLIDAY_SEASON.label} (each year)`;
}
