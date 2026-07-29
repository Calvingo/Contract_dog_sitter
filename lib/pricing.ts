import {
  countHolidayDaysInStay,
  formatHolidayRangesForDisplay,
  HOLIDAY_FEE_PER_DAY,
} from "./holidays";

export const SENIOR_DOG_AGE_YEARS = 10;
export const SENIOR_DOG_FEE_PER_DAY = 10;
export const INTACT_DOG_FEE_PER_DAY = 10;
export const DEPOSIT_PERCENT = 20;

export type PriceBreakdown = {
  dailyRate: number;
  weightTier: string;
  billableDays: number;
  totalHours: number;
  boardingSubtotal: number;
  seniorDogAgeYears: number;
  seniorDogFeePerDay: number;
  seniorDogFee: number;
  intactDogFeePerDay: number;
  intactDogFee: number;
  holidayDays: number;
  holidayFeePerDay: number;
  holidayFee: number;
  holidayDates: string[];
  totalPrice: number;
  depositAmount: number;
  summary: string;
};

export function getDailyRate(weightLb: number): number {
  if (weightLb <= 69) return 65;
  if (weightLb <= 89) return 69;
  return 79;
}

export function getWeightTierLabel(weightLb: number): string {
  if (weightLb <= 69) return "0–69 lb — $65/day";
  if (weightLb <= 89) return "70–89 lb — $69/day";
  return "90+ lb — $79/day";
}

export function parseDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Rover-style: 24h = 1 day; remainder ≤2h no extra; 2–8h +0.5 day; 8h+ +1 day */
export function calculateBillableDays(totalHours: number): number {
  if (totalHours <= 0) return 0;

  const fullDays = Math.floor(totalHours / 24);
  const remainderHours = totalHours % 24;

  let extra = 0;
  if (remainderHours > 2) {
    extra = remainderHours < 8 ? 0.5 : 1;
  }

  let billableDays = fullDays + extra;

  if (billableDays === 0 && remainderHours > 0) {
    billableDays = remainderHours <= 2 ? 0.5 : extra || 1;
  }

  return billableDays;
}

function buildSummary(
  billableDays: number,
  dailyRate: number,
  boardingSubtotal: number,
  seniorDogFee: number,
  intactDogFee: number,
  holidayFee: number,
  totalPrice: number
): string {
  const daysLabel = billableDays === 1 ? "1 day" : `${billableDays} days`;
  let summary = `${daysLabel} × $${dailyRate}/day = $${boardingSubtotal.toFixed(2)}`;
  if (seniorDogFee > 0) {
    summary += ` + senior dog fee (${daysLabel} × $${SENIOR_DOG_FEE_PER_DAY}/day) = $${seniorDogFee.toFixed(2)}`;
  }
  if (intactDogFee > 0) {
    summary += ` + unspayed/unneutered dog fee (${daysLabel} × $${INTACT_DOG_FEE_PER_DAY}/day) = $${intactDogFee.toFixed(2)}`;
  }
  if (holidayFee > 0) {
    summary += ` + holiday rate for entire stay (${daysLabel} × $${HOLIDAY_FEE_PER_DAY}/day) = $${holidayFee.toFixed(2)}`;
  }
  summary += ` → Total $${totalPrice.toFixed(2)}`;
  return summary;
}

export function calculatePrice(
  weightLb: number,
  petAgeYears: number,
  spayedNeuteredAnswer: string,
  dropoffDate: string,
  dropoffTime: string,
  pickupDate: string,
  pickupTime: string
): PriceBreakdown | null {
  const dropoff = parseDateTime(dropoffDate, dropoffTime);
  const pickup = parseDateTime(pickupDate, pickupTime);
  if (
    !dropoff ||
    !pickup ||
    pickup <= dropoff ||
    weightLb <= 0 ||
    !Number.isFinite(petAgeYears) ||
    petAgeYears < 0
  ) {
    return null;
  }

  const totalMs = pickup.getTime() - dropoff.getTime();
  const totalHours = totalMs / (1000 * 60 * 60);
  const billableDays = calculateBillableDays(totalHours);
  const dailyRate = getDailyRate(weightLb);
  const boardingSubtotal =
    Math.round(billableDays * dailyRate * 100) / 100;
  const seniorDogFee =
    petAgeYears >= SENIOR_DOG_AGE_YEARS
      ? Math.round(billableDays * SENIOR_DOG_FEE_PER_DAY * 100) / 100
      : 0;
  const intactDogFee =
    spayedNeuteredAnswer === "no"
      ? Math.round(billableDays * INTACT_DOG_FEE_PER_DAY * 100) / 100
      : 0;

  const { holidayDays, holidayDates } = countHolidayDaysInStay(
    dropoffDate,
    pickupDate
  );
  const holidayBillableDays = holidayDays > 0 ? billableDays : 0;
  const holidayFee =
    Math.round(holidayBillableDays * HOLIDAY_FEE_PER_DAY * 100) / 100;
  const totalPrice =
    Math.round((boardingSubtotal + seniorDogFee + intactDogFee + holidayFee) * 100) / 100;
  const depositAmount = Math.round(totalPrice * (DEPOSIT_PERCENT / 100) * 100) / 100;

  return {
    dailyRate,
    weightTier: getWeightTierLabel(weightLb),
    billableDays,
    totalHours: Math.round(totalHours * 10) / 10,
    boardingSubtotal,
    seniorDogAgeYears: SENIOR_DOG_AGE_YEARS,
    seniorDogFeePerDay: SENIOR_DOG_FEE_PER_DAY,
    seniorDogFee,
    intactDogFeePerDay: INTACT_DOG_FEE_PER_DAY,
    intactDogFee,
    holidayDays: holidayBillableDays,
    holidayFeePerDay: HOLIDAY_FEE_PER_DAY,
    holidayFee,
    holidayDates,
    totalPrice,
    depositAmount,
    summary: buildSummary(
      billableDays,
      dailyRate,
      boardingSubtotal,
      seniorDogFee,
      intactDogFee,
      holidayFee,
      totalPrice
    ),
  };
}

export function formatDateTime(date: string, time: string): string {
  if (!date || !time) return "";
  const parsed = parseDateTime(date, time);
  if (!parsed) return `${date} ${time}`;
  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  });
}

export { formatHolidayRangesForDisplay, HOLIDAY_FEE_PER_DAY };
