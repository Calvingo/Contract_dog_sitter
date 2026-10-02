"use client";
import { useState } from "react";
import {
  holidays,
  holidaySchedule,
  type Holiday,
} from "@/lib/marketing/templates";
import { todayKey } from "@/lib/platform/rules";
export function CampaignFields({
  campaign,
}: {
  campaign?: {
    name: string;
    subject: string;
    body: string;
    excludeStart: string;
    excludeEnd: string;
    scheduledAt: Date;
  };
}) {
  const [fields, setFields] = useState({
    name: campaign?.name || "",
    subject: campaign?.subject || "",
    body: campaign?.body || "",
    excludeStart: campaign?.excludeStart || "",
    excludeEnd: campaign?.excludeEnd || "",
    sendDate: campaign?.scheduledAt.toISOString().slice(0, 10) || "",
  });
  const change = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  function template(value: string) {
    if (!(value in holidays)) return;
    const holiday = value as Holiday;
    let year = Number(todayKey().slice(0, 4));
    if (holidaySchedule(holiday, year).scheduledAt < new Date()) year++;
    const schedule = holidaySchedule(holiday, year);
    setFields({
      name: `${holidays[holiday].name} ${year}`,
      subject: holidays[holiday].subject,
      body: holidays[holiday].body,
      excludeStart: schedule.excludeStart,
      excludeEnd: schedule.excludeEnd,
      sendDate: schedule.scheduledAt.toISOString().slice(0, 10),
    });
  }
  return (
    <>
      {!campaign && (
        <label>
          Start with a template
          <select defaultValue="" onChange={(e) => template(e.target.value)}>
            <option value="">Custom email</option>
            {Object.entries(holidays).map(([key, t]) => (
              <option key={key} value={key}>
                {t.name}
              </option>
            ))}
          </select>
          <span className="small">
            Templates use the next future date three months before the holiday.
            Dates and copy are editable.
          </span>
        </label>
      )}
      <label>
        Campaign name
        <input
          name="name"
          maxLength={120}
          value={fields.name}
          onChange={(e) => change("name", e.target.value)}
          required
          placeholder="Thanksgiving 2027"
        />
      </label>
      <label>
        Subject
        <input
          name="subject"
          maxLength={150}
          value={fields.subject}
          onChange={(e) => change("subject", e.target.value)}
          required
        />
      </label>
      <label>
        Email message
        <textarea
          name="body"
          rows={6}
          minLength={10}
          maxLength={10000}
          value={fields.body}
          onChange={(e) => change("body", e.target.value)}
          required
          placeholder="Write your promotion. The booking button, mailing address and unsubscribe link are added automatically."
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label>
          Send on
          <input
            name="sendDate"
            type="date"
            required
            value={fields.sendDate}
            onChange={(e) => change("sendDate", e.target.value)}
          />
        </label>
        <label>
          Exclude stays from
          <input
            name="excludeStart"
            type="date"
            required
            value={fields.excludeStart}
            onChange={(e) => change("excludeStart", e.target.value)}
          />
        </label>
        <label>
          Through (inclusive)
          <input
            name="excludeEnd"
            type="date"
            required
            min={fields.excludeStart}
            value={fields.excludeEnd}
            onChange={(e) => change("excludeEnd", e.target.value)}
          />
        </label>
      </div>
    </>
  );
}
