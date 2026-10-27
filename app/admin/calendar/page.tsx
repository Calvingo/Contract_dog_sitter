import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { acceptedOccupancyWhere, availability, getSettings } from "@/lib/platform/capacity";
import { acceptedStay, reservesCapacity, stayDates, dateKey, todayKey, validDate } from "@/lib/platform/rules";
import { prisma } from "@/lib/db";
import { acceptedBookingDetails } from "@/lib/platform/accepted-booking";
import { AdminCapacityCalendar } from "@/components/AdminCapacityCalendar";
import { AdminShell, StatusBadge } from "../admin-ui";
export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;
  const month = validDate(`${params.month}-01`)
    ? params.month!
    : todayKey().slice(0, 7);
  const start = `${month}-01`,
    end = dateKey(
      new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)),
    );
  // Counts and detail rows share one database snapshot, even during acceptance.
  const { result, settings, bookings, overrides } = await prisma.$transaction(async (tx) => {
    const [result, settings, bookings, overrides] = await Promise.all([
      availability(start, end, tx),
      getSettings(tx),
      tx.submission.findMany({
        where: acceptedOccupancyWhere(start, end),
        orderBy: { acceptedDropoffAt: "asc" },
        include: {
          pet: true, customer: true, revisions: true,
          submissionPets: { orderBy: { position: "asc" }, include: { pet: true } },
        },
      }),
      tx.dailyCapacity.findMany({
        where: { date: { gte: start, lte: end } }, orderBy: { date: "asc" },
      }),
    ]);
    return { result, settings, bookings, overrides };
  }, { isolationLevel: "RepeatableRead" });
  const blocks: { start: string; end: string; note: string }[] = [];
  for (const row of overrides.filter(
    (row) => row.blocked || row.capacity === 0,
  )) {
    const last = blocks.at(-1);
    if (
      last &&
      last.note === row.note &&
      Date.parse(row.date) - Date.parse(last.end) === 86400000
    )
      last.end = row.date;
    else blocks.push({ start: row.date, end: row.date, note: row.note });
  }
  const over = result.days.filter((day) => day.overCapacity);
  return (
    <AdminShell
      email={admin.email}
      title="Calendar & capacity"
      subtitle={`Default capacity: ${settings.defaultCapacity} dogs. ${settings.includePickupDay ? "Arrival and pick-up dates both count." : "Capacity is counted by night."}`}
    >
      {over.length > 0 && (
        <p role="alert" className="notice error">
          {over.length} day(s) exceed the current limit. Review existing stays
          before accepting more dogs.
        </p>
      )}
      <AdminCapacityCalendar
        month={month}
        days={result.days}
        defaultCapacity={settings.defaultCapacity}
        blocks={blocks}
      />
      <p className="small">
        Counts use the last administrator-accepted dates and dog count, including stays with pending changes. Payment and request expiry do not change occupancy.
      </p>
      <section className="panel table-scroll">
        <h2>Stays in this month</h2>
        <table className="platform-table">
          <thead>
            <tr>
              <th>Dogs</th>
              <th>Owner</th>
              <th>Dates</th>
              <th>Status</th>
              <th>Request window (does not expire accepted stays)</th>
            </tr>
          </thead>
          <tbody>
            {bookings.filter(b => reservesCapacity(b) && stayDates(acceptedStay(b).dropoffAt, acceptedStay(b).pickupAt, settings.includePickupDay).some(date => date >= start && date <= end)).map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/admin/submissions/${b.id}`}>
                    {acceptedBookingDetails(b).dogNames} · {acceptedStay(b).dogs} accepted dogs
                  </Link>
                </td>
                <td>
                  {b.customer.firstName} {b.customer.lastName}
                </td>
                <td>
                  {dateKey(acceptedStay(b).dropoffAt)} → {dateKey(acceptedStay(b).pickupAt)}
                </td>
                <td>
                  <StatusBadge status={b.status} />
                </td>
                <td>
                  {b.holdExpiresAt
                    ? b.holdExpiresAt.toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })
                    : "No request deadline"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bookings.length && <p className="notice">No stays for this month.</p>}
      </section>
    </AdminShell>
  );
}
