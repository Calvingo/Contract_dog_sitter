"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveDailyCapacity } from "@/app/admin/platform-actions";
import { dateKey, dateRange, validDate } from "@/lib/platform/rules";

type Day = {
  date: string;
  occupied: number;
  capacity: number;
  remaining: number;
  closed: boolean;
  overCapacity: boolean;
};
export function AdminCapacityCalendar({
  month,
  days,
  defaultCapacity,
  blocks,
}: {
  month: string;
  days: Day[];
  defaultCapacity: number;
  blocks: { start: string; end: string; note: string }[];
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [mode, setMode] = useState("block");
  const [state, action, pending] = useActionState(saveDailyCapacity, {});
  const first = new Date(`${month}-01T00:00:00Z`);
  const monthOffset = (offset: number) =>
    dateKey(
      new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1),
      ),
    ).slice(0, 7);
  const valid =
    validDate(start) &&
    validDate(end) &&
    end >= start &&
    (Date.parse(end) - Date.parse(start)) / 86400000 <= 366;
  const selectedDays = valid ? dateRange(start, end) : [];
  const bookedDays = days.filter(
    (d) => selectedDays.includes(d.date) && d.occupied > 0,
  ).length;
  const select = (date: string) => {
    if (!selectingEnd) {
      setStart(date);
      setEnd(date);
      setSelectingEnd(true);
    } else {
      setStart(date < start ? date : start);
      setEnd(date < start ? start : date);
      setSelectingEnd(false);
    }
  };
  return (
    <section className="panel admin-capacity-calendar">
      <div className="section-heading">
        <div>
          <h2>Block dates</h2>
          <p>
            Select the first and last date, then block the range. Both dates are
            included.
          </p>
        </div>
        <Link className="text-link" href="/admin/settings">
          Default limit: {defaultCapacity} dogs →
        </Link>
      </div>
      <div className="calendar-month-nav">
        <Link
          className="button secondary"
          aria-label="Previous month"
          href={`/admin/calendar?month=${monthOffset(-1)}`}
        >
          ←
        </Link>
        <h3>
          {first.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </h3>
        <Link
          className="button secondary"
          aria-label="Next month"
          href={`/admin/calendar?month=${monthOffset(1)}`}
        >
          →
        </Link>
      </div>
      <div className="calendar-legend">
        <span>Available</span>
        <span className="full">Full</span>
        <span className="closed">Blocked</span>
        <span className="selected">Selected</span>
      </div>
      <div
        className="capacity-grid admin-month-grid"
        aria-label="Admin availability calendar"
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div className="weekday" key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: first.getUTCDay() }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            disabled={pending}
            className={`capacity-day ${day.closed ? "closed" : day.remaining === 0 ? "full" : ""} ${day.overCapacity ? "over" : ""} ${selectedDays.includes(day.date) ? "selected" : ""}`}
            aria-label={`${day.date}: ${day.closed ? "blocked" : `${day.remaining} available`}, ${day.occupied} dogs booked`}
            aria-pressed={selectedDays.includes(day.date)}
            onClick={() => select(day.date)}
          >
            <strong>{Number(day.date.slice(8))}</strong>
            <span>
              {day.occupied}/{day.capacity} dogs
            </span>
            <span>
              {day.closed
                ? "Blocked"
                : day.overCapacity
                  ? "Over limit"
                  : day.remaining === 0
                    ? "Full"
                    : `${day.remaining} free`}
            </span>
          </button>
        ))}
      </div>
      <p className="small" aria-live="polite">
        {selectingEnd
          ? "Now choose the last date, or keep this single day."
          : "Click a date to start a new selection. Use the date fields for a range across months."}
      </p>
      <form action={action} className="calendar-range-form">
        <fieldset disabled={pending} className="form-stack">
          <div className="field-grid">
            <label>
              From
              <input
                type="date"
                name="start"
                required
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setSelectingEnd(false);
                }}
              />
            </label>
            <label>
              Through (inclusive)
              <input
                type="date"
                name="end"
                required
                min={start}
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setSelectingEnd(false);
                }}
              />
            </label>
          </div>
          <div className="calendar-mode-tabs" aria-label="Calendar action">
            <button
              type="button"
              aria-pressed={mode === "block"}
              className={`button ${mode === "block" ? "" : "secondary"}`}
              onClick={() => setMode("block")}
            >
              Block dates
            </button>
            <button
              type="button"
              aria-pressed={mode === "unblock"}
              className={`button ${mode === "unblock" ? "" : "secondary"}`}
              onClick={() => setMode("unblock")}
            >
              Unblock dates
            </button>
            <button
              type="button"
              aria-pressed={mode === "capacity" || mode === "reset"}
              className={`button ${mode === "capacity" || mode === "reset" ? "" : "secondary"}`}
              onClick={() => setMode("capacity")}
            >
              Adjust limit
            </button>
          </div>
          <input type="hidden" name="mode" value={mode} />
          {mode === "block" && (
            <label>
              Reason (optional, admin only)
              <input
                name="note"
                maxLength={300}
                placeholder="e.g. Vacation or family time"
              />
            </label>
          )}
          {(mode === "capacity" || mode === "reset") && (
            <>
              <label>
                Maximum dogs
                <input
                  type="number"
                  name="capacity"
                  min="1"
                  max="100"
                  defaultValue={defaultCapacity || 17}
                  required={mode === "capacity"}
                  disabled={mode === "reset"}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={mode === "reset"}
                  onChange={(e) =>
                    setMode(e.target.checked ? "reset" : "capacity")
                  }
                />
                Use the default limit ({defaultCapacity} dogs)
              </label>
              <p className="small">
                Changing the limit does not remove a manual block. Choose
                Unblock dates to reopen it.
              </p>
            </>
          )}
          <p className="notice" aria-live="polite">
            {valid
              ? `${start} → ${end} · ${selectedDays.length} day${selectedDays.length === 1 ? "" : "s"}`
              : "Choose a valid start and end date."}
          </p>
          {mode === "block" && (
            <p className="small">
              Blocking stops new bookings. Existing reservations stay in place.
              {bookedDays > 0
                ? ` ${bookedDays} selected day(s) in this month already have bookings.`
                : ""}
            </p>
          )}
          {mode === "unblock" && (
            <p className="small">
              Remove manual blocks for this range. Dates that are already full
              remain unavailable.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="button" disabled={!valid || pending}>
              {pending
                ? "Saving…"
                : mode === "block"
                  ? "Confirm block"
                  : mode === "unblock"
                    ? "Confirm unblock"
                    : "Save limit"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setStart("");
                setEnd("");
                setSelectingEnd(false);
              }}
            >
              Clear selection
            </button>
          </div>
        </fieldset>
        {state.error && (
          <p className="notice error" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="notice" role="status">
            {state.message}
          </p>
        )}
      </form>
      <div className="calendar-block-list">
        <h3>Blocked dates this month</h3>
        {blocks.length === 0 ? (
          <p className="small">No manual blocks this month.</p>
        ) : (
          blocks.map((b) => (
            <div className="calendar-block-row" key={b.start}>
              <div>
                <strong>
                  {b.start}
                  {b.end !== b.start ? ` → ${b.end}` : ""}
                </strong>
                {b.note && <p className="small">{b.note}</p>}
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => {
                  setStart(b.start);
                  setEnd(b.end);
                  setSelectingEnd(false);
                  setMode("unblock");
                }}
              >
                Select to unblock
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
