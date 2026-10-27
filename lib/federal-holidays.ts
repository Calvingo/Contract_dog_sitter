// OPM nationwide federal holidays. Dates are California boarding calendar dates,
// encoded as UTC wall-clock values, consistent with pricing.ts (not instants).
export const HOLIDAY_BOOKING_POLICY = "Holiday Booking Policy: If any date of your stay falls on a U.S. federal holiday, the 20% deposit is non-refundable, regardless of when the booking is cancelled.";
export const DEPOSIT_POLICY_VERSION = "2026-10-federal-v1";
export function federalHolidays(year: number) {
  const result: { date: string; name: string }[] = [];
  const add = (date: Date, name: string) => result.push({date: date.toISOString().slice(0,10), name});
  const fixed = (month: number, day: number, name: string) => {
    const date = new Date(Date.UTC(year, month - 1, day)); add(date, name);
    const weekday = date.getUTCDay();
    if (weekday === 6 || weekday === 0) {
      date.setUTCDate(date.getUTCDate() + (weekday === 6 ? -1 : 1)); add(date, `${name} (observed)`);
    }
  };
  const nth = (month: number, weekday: number, n: number, name: string) => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    add(new Date(Date.UTC(year, month - 1, 1 + (weekday - first.getUTCDay() + 7) % 7 + (n - 1) * 7)), name);
  };
  fixed(1,1,"New Year's Day"); nth(1,1,3,"Birthday of Martin Luther King, Jr."); nth(2,1,3,"Washington’s Birthday");
  const memorial = new Date(Date.UTC(year,5,0)); memorial.setUTCDate(memorial.getUTCDate() - (memorial.getUTCDay()+6)%7); add(memorial,"Memorial Day");
  fixed(6,19,"Juneteenth National Independence Day"); fixed(7,4,"Independence Day"); nth(9,1,1,"Labor Day"); nth(10,1,2,"Columbus Day"); fixed(11,11,"Veterans Day"); nth(11,4,4,"Thanksgiving Day"); fixed(12,25,"Christmas Day");
  return result;
}
export function depositPolicy(start: string, end: string, total: number) {
  const holidays = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    for (let year = Number(start.slice(0,4))-1; year <= Number(end.slice(0,4))+1; year++) {
      holidays.push(...federalHolidays(year).filter(h => h.date >= start && h.date <= end));
    }
  }
  const deposit = Math.round(total * 20) / 100;
  return { version: DEPOSIT_POLICY_VERSION, text: HOLIDAY_BOOKING_POLICY, deposit, nonRefundable: holidays.length > 0, nonRefundableAmount: holidays.length ? deposit : 0, holidays };
}

export type DepositPolicy = ReturnType<typeof depositPolicy>;
