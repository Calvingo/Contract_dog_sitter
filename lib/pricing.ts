export type PriceBreakdown = {
  dailyRate: number;
  weightTier: string;
  billableDays: number;
  totalHours: number;
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

export function calculatePrice(
  weightLb: number,
  dropoffDate: string,
  dropoffTime: string,
  pickupDate: string,
  pickupTime: string
): PriceBreakdown | null {
  const dropoff = parseDateTime(dropoffDate, dropoffTime);
  const pickup = parseDateTime(pickupDate, pickupTime);
  if (!dropoff || !pickup || pickup <= dropoff || weightLb <= 0) {
    return null;
  }

  const totalMs = pickup.getTime() - dropoff.getTime();
  const totalHours = totalMs / (1000 * 60 * 60);
  const billableDays = calculateBillableDays(totalHours);
  const dailyRate = getDailyRate(weightLb);
  const totalPrice = Math.round(billableDays * dailyRate * 100) / 100;

  const daysLabel =
    billableDays === 1 ? "1 day" : `${billableDays} days`;

  return {
    dailyRate,
    weightTier: getWeightTierLabel(weightLb),
    billableDays,
    totalHours: Math.round(totalHours * 10) / 10,
    totalPrice,
    summary: `${daysLabel} × $${dailyRate}/day = $${totalPrice.toFixed(2)}`,
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
