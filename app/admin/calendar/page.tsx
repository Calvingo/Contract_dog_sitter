import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { availability, getSettings } from "@/lib/platform/capacity";
import { dateKey, todayKey, validDate } from "@/lib/platform/rules";
import { prisma } from "@/lib/db";
import { submissionDogNames } from "@/lib/submission-pets";
import { ActionForm } from "@/components/ActionForm";
import { AdminShell, StatusBadge } from "../admin-ui";
import { saveDailyCapacity } from "../platform-actions";
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
  const [result, settings, bookings] = await Promise.all([
    availability(start, end),
    getSettings(),
    prisma.submission.findMany({
      where: {
        dropoffAt: { lte: new Date(`${end}T23:59:59Z`) },
        pickupAt: { gte: new Date(`${start}T00:00:00Z`) },
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      orderBy: { dropoffAt: "asc" },
      include: {
        pet: true,
        customer: true,
        submissionPets: {
          orderBy: { position: "asc" },
          include: { pet: true },
        },
      },
    }),
  ]);
  const over = result.days.filter((day) => day.overCapacity);
  return (
    <AdminShell
      email={admin.email}
      title="Calendar & capacity"
      subtitle={`Default capacity: ${settings.defaultCapacity} dogs. ${settings.includePickupDay ? "Arrival and pick-up dates both count." : "Capacity is counted by night."}`}
    >
      <section className="panel">
        <form className="filter-form">
          <label>
            View month
            <input type="month" name="month" defaultValue={month} required />
          </label>
          <button className="button">View calendar</button>
          <Link className="button secondary" href="/admin/settings">
            Default settings
          </Link>
        </form>
        {over.length > 0 && (
          <p role="alert" className="notice error">
            {over.length} day(s) exceed the current limit. Existing reservations
            remain in place; resolve these manually before accepting more dogs.
          </p>
        )}
        <div className="capacity-grid">
          {result.days.map((day) => (
            <div
              key={day.date}
              className={`capacity-day ${day.closed ? "closed" : day.remaining === 0 ? "full" : ""} ${day.overCapacity ? "over" : ""}`}
            >
              <strong>{Number(day.date.slice(8))}</strong>
              <div>
                {day.occupied} / {day.capacity} dogs
              </div>
              <div>
                {day.overCapacity
                  ? "Over capacity"
                  : day.closed
                    ? "Closed"
                    : `${day.remaining} available`}
              </div>
            </div>
          ))}
        </div>
        <p className="small">
          Includes active holds and verified deposits. Expired unpaid holds
          release their space automatically.
        </p>
      </section>
      <section className="panel">
        <h2>Adjust daily limits</h2>
        <ActionForm action={saveDailyCapacity} label="Update capacity">
          <div className="field-grid">
            <label>
              From
              <input
                type="date"
                name="start"
                defaultValue={todayKey()}
                required
              />
            </label>
            <label>
              Through
              <input
                type="date"
                name="end"
                defaultValue={todayKey()}
                required
              />
            </label>
            <label>
              Maximum dogs (0 = closed)
              <input
                type="number"
                name="capacity"
                min="0"
                max="100"
                defaultValue={settings.defaultCapacity}
                required
              />
            </label>
            <label>
              Internal note
              <input
                name="note"
                maxLength={300}
                placeholder="e.g. Holiday staffing"
              />
            </label>
          </div>
          <label className="check-label">
            <input type="checkbox" name="reset" />
            <span>
              Remove overrides for these dates and use the default capacity
              instead.
            </span>
          </label>
        </ActionForm>
      </section>
      <section className="panel table-scroll">
        <h2>Stays in this month</h2>
        <table className="platform-table">
          <thead>
            <tr>
              <th>Dogs</th>
              <th>Owner</th>
              <th>Dates</th>
              <th>Status</th>
              <th>Hold deadline</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/admin/submissions/${b.id}`}>
                    {submissionDogNames(b.submissionPets, b.pet.name)}
                  </Link>
                </td>
                <td>
                  {b.customer.firstName} {b.customer.lastName}
                </td>
                <td>
                  {dateKey(b.dropoffAt)} → {dateKey(b.pickupAt)}
                </td>
                <td>
                  <StatusBadge status={b.status} />
                </td>
                <td>
                  {b.holdExpiresAt
                    ? b.holdExpiresAt.toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })
                    : "Legacy reservation"}
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
