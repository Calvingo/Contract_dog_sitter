import { prisma } from "@/lib/db";
import { getSettings, lockCapacity } from "./capacity";
import { dateRange } from "./rules";

export type CalendarMode = "block" | "unblock" | "capacity" | "reset";
export async function updateCalendarRange(options: {
  start: string;
  end: string;
  mode: CalendarMode;
  capacity?: number;
  note?: string;
}) {
  const dates = dateRange(options.start, options.end);
  if (!["block", "unblock", "capacity", "reset"].includes(options.mode))
    throw new Error("Choose a calendar action.");
  if (
    options.mode === "capacity" &&
    (!Number.isInteger(options.capacity) ||
      options.capacity! < 1 ||
      options.capacity! > 100)
  )
    throw new Error(
      "Capacity must be a whole number from 1 to 100. Use Block dates to close dates.",
    );
  const note = (options.note || "").trim().slice(0, 300);
  await prisma.$transaction(
    async (tx) => {
      await lockCapacity(tx);
      const settings = await getSettings(tx);
      for (const date of dates) {
        const current = await tx.dailyCapacity.findUnique({ where: { date } });
        if (options.mode === "block") {
          await tx.dailyCapacity.upsert({
            where: { date },
            create: {
              date,
              capacity: settings.defaultCapacity,
              blocked: true,
              note,
            },
            update: { blocked: true, note },
          });
        } else if (options.mode === "unblock") {
          if (current)
            await tx.dailyCapacity.update({
              where: { date },
              data: {
                blocked: false,
                capacity: current.capacity || settings.defaultCapacity,
                note: "",
              },
            });
        } else if (options.mode === "capacity") {
          await tx.dailyCapacity.upsert({
            where: { date },
            create: { date, capacity: options.capacity! },
            update: { capacity: options.capacity! },
          });
        } else if (current?.blocked) {
          await tx.dailyCapacity.update({
            where: { date },
            data: { capacity: settings.defaultCapacity },
          });
        } else if (current) {
          await tx.dailyCapacity.delete({ where: { date } });
        }
      }
    },
    { timeout: 15000 },
  );
  const label = {
    block: "Blocked",
    unblock: "Unblocked",
    capacity: "Updated capacity for",
    reset: "Restored default capacity for",
  }[options.mode];
  return `${label} ${dates.length} day${dates.length === 1 ? "" : "s"}: ${options.start} through ${options.end}. Existing bookings are unchanged.${options.mode === "unblock" ? " Full dates still cannot be booked." : ""}`;
}
