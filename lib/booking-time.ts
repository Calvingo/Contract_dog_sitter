export const EARLIEST_PICKUP_DROPOFF_TIME = "08:30";
export const LATEST_PICKUP_DROPOFF_TIME = "21:00";
export const PICKUP_DROPOFF_TIME_STEP_MINUTES = 30;

export type BookingTimeOption = {
  value: string;
  label: string;
};

export function isPickupDropoffTimeAllowed(time: string): boolean {
  return (
    time >= EARLIEST_PICKUP_DROPOFF_TIME &&
    time <= LATEST_PICKUP_DROPOFF_TIME
  );
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutesAsTimeValue(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatTimeLabel(value: string): string {
  const [hours24, minutes] = value.split(":").map(Number);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function getPickupDropoffTimeOptions(): BookingTimeOption[] {
  const start = parseTimeToMinutes(EARLIEST_PICKUP_DROPOFF_TIME);
  const end = parseTimeToMinutes(LATEST_PICKUP_DROPOFF_TIME);
  const options: BookingTimeOption[] = [];

  for (
    let cursor = start;
    cursor <= end;
    cursor += PICKUP_DROPOFF_TIME_STEP_MINUTES
  ) {
    const value = formatMinutesAsTimeValue(cursor);
    options.push({ value, label: formatTimeLabel(value) });
  }

  return options;
}
