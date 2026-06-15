export const EARLIEST_PICKUP_DROPOFF_TIME = "08:30";
export const LATEST_PICKUP_DROPOFF_TIME = "21:00";

export function isPickupDropoffTimeAllowed(time: string): boolean {
  return (
    time >= EARLIEST_PICKUP_DROPOFF_TIME &&
    time <= LATEST_PICKUP_DROPOFF_TIME
  );
}
