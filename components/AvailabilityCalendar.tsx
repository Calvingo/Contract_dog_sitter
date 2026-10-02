"use client";
import { useEffect, useState } from "react";
import { dateKey, todayKey } from "@/lib/platform/rules";
type Day = { date: string; remaining: number; closed: boolean };
export function AvailabilityCalendar({
  dogs = 1,
  start = "",
  end = "",
  onSelect,
  editToken,
}: {
  dogs?: number;
  start?: string;
  end?: string;
  onSelect?: (start: string, end: string) => void;
  editToken?: string | null;
}) {
  const [month, setMonth] = useState(() => (start || todayKey()).slice(0, 7));
  const [days, setDays] = useState<Day[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [inclusive, setInclusive] = useState(true);
  const [reload, setReload] = useState(0);
  const first = `${month}-01`;
  const last = dateKey(
    new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)),
  );
  const tokenQuery = editToken
    ? `&editToken=${encodeURIComponent(editToken)}`
    : "";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/availability?start=${first}&end=${last}${tokenQuery}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setDays(data.days);
        setInclusive(data.includePickupDay);
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setError("Availability could not be loaded. Please retry.");
          setDays([]);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [first, last, tokenQuery, reload]);
  async function select(date: string) {
    if (!onSelect) return;
    if (!start || end || date < start) {
      onSelect(date, "");
      setError("");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const response = await fetch(
        `/api/availability?start=${start}&end=${date}${tokenQuery}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const stay: Day[] =
        !data.includePickupDay && date > start
          ? data.days.slice(0, -1)
          : data.days;
      if (stay.some((day) => day.remaining < dogs || day.closed))
        throw new Error(
          "Some dates in this stay do not have enough space. Choose another range.",
        );
      onSelect(start, date);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setChecking(false);
    }
  }
  function shift(delta: number) {
    const date = new Date(`${first}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(dateKey(date).slice(0, 7));
  }
  return (
    <section className="availability panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MAKE ROOM FOR A LITTLE ADVENTURE</p>
          <h2>Find their next stay</h2>
        </div>
        <span className="pill">
          {dogs} dog{dogs === 1 ? "" : "s"}
        </span>
      </div>
      <div className="calendar-toolbar">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          disabled={month <= todayKey().slice(0, 7) || checking}
        >
          ←
        </button>
        <h3>
          {new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </h3>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          disabled={
            Number(month.slice(0, 4)) > Number(todayKey().slice(0, 4)) + 1 ||
            checking
          }
        >
          →
        </button>
      </div>
      <div className="calendar-grid" aria-label="Availability calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span className="weekday" key={day}>
            {day}
          </span>
        ))}
        {Array.from(
          { length: new Date(`${first}T12:00:00Z`).getUTCDay() },
          (_, i) => (
            <span key={`blank-${i}`} />
          ),
        )}
        {!loading &&
          days.map((day) => {
            const full = day.closed || day.remaining < dogs;
            const pickupOnly = Boolean(
              onSelect && start && !end && !inclusive && day.date > start,
            );
            const disabled =
              checking || day.date < todayKey() || (full && !pickupOnly);
            const selected = day.date === start || day.date === end;
            const between = start && end && day.date > start && day.date < end;
            return (
              <button
                type="button"
                key={day.date}
                disabled={disabled}
                onClick={() => void select(day.date)}
                className={`calendar-day ${full ? "full" : "available"} ${selected ? "selected" : ""} ${between ? "in-range" : ""}`}
                aria-label={`${day.date}: ${day.closed ? "closed" : full ? "not enough space" : `${day.remaining} spaces available`}`}
                aria-pressed={selected}
              >
                <strong>{Number(day.date.slice(8))}</strong>
                <span>
                  {day.closed ? "Closed" : full ? "Full" : "Available"}
                </span>
              </button>
            );
          })}
      </div>
      {loading && (
        <p role="status" className="notice">
          Checking availability…
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}{" "}
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      <p className="small">
        {onSelect
          ? !start || end
            ? "Select a drop-off date, then a pick-up date."
            : "Now choose a pick-up date."
          : "Sign in to choose dates and submit a booking."}{" "}
        {inclusive
          ? "Arrival and pick-up dates both count toward daily capacity."
          : "Capacity is counted by night; same-day stays use one day."}
      </p>
      {start && (
        <div className="calendar-selection">
          <span>
            Drop-off <strong>{start}</strong>
          </span>
          <span>
            Pick-up <strong>{end || "Select a date"}</strong>
          </span>
        </div>
      )}
      <p className="small">
        Availability is checked again when you submit. Dates are in Pacific
        local time.
      </p>
    </section>
  );
}
