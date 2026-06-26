import {
  countHolidayDaysInStay,
  formatHolidayRangesForDisplay,
  HOLIDAY_FEE_PER_DAY,
} from "./holidays";

export const SENIOR_DOG_AGE_YEARS = 10;
export const SENIOR_DOG_FEE_PER_DAY = 10;

export type PriceBreakdown = {
  dailyRate: number;
  weightTier: string;
  billableDays: number;
  totalHours: number;
  boardingSubtotal: number;
  seniorDogAgeYears: number;
  seniorDogFeePerDay: number;
  seniorDogFee: number;
  holidayDays: number;
  holidayFeePerDay: number;
  holidayFee: number;
  holidayDates: string[];
  totalPrice: number;
  summary: string;
};

export function getDailyRate(weightLb: number): number {
  if (weightLb < 20) return 49;
  if (weightLb <= 39) return 49;
  if (weightLb <= 69) return 59;
  if (weightLb <= 89) return 69;
  return 79;
}

export function getWeightTierLabel(weightLb: number): string {
  if (weightLb < 20) return "Under 20 lb (20–39 lb rate applies)";
  if (weightLb <= 39) return "20–39 lb — $49/day";
  if (weightLb <= 69) return "40–69 lb — $59/day";
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
  holidayFee: number,
  totalPrice: number
): string {
  const daysLabel = billableDays === 1 ? "1 day" : `${billableDays} days`;
  let summary = `${daysLabel} × $${dailyRate}/day = $${boardingSubtotal.toFixed(2)}`;
  if (seniorDogFee > 0) {
    summary += ` + senior dog fee (${daysLabel} × $${SENIOR_DOG_FEE_PER_DAY}/day) = $${seniorDogFee.toFixed(2)}`;
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

  const { holidayDays, holidayDates } = countHolidayDaysInStay(
    dropoffDate,
    pickupDate
  );
  const holidayBillableDays = holidayDays > 0 ? billableDays : 0;
  const holidayFee =
    Math.round(holidayBillableDays * HOLIDAY_FEE_PER_DAY * 100) / 100;
  const totalPrice =
    Math.round((boardingSubtotal + seniorDogFee + holidayFee) * 100) / 100;

  return {
    dailyRate,
    weightTier: getWeightTierLabel(weightLb),
    billableDays,
    totalHours: Math.round(totalHours * 10) / 10,
    boardingSubtotal,
    seniorDogAgeYears: SENIOR_DOG_AGE_YEARS,
    seniorDogFeePerDay: SENIOR_DOG_FEE_PER_DAY,
    seniorDogFee,
    holidayDays: holidayBillableDays,
    holidayFeePerDay: HOLIDAY_FEE_PER_DAY,
    holidayFee,
    holidayDates,
    totalPrice,
    summary: buildSummary(
      billableDays,
      dailyRate,
      boardingSubtotal,
      seniorDogFee,
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
