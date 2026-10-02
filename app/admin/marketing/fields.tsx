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
  return (
    <>
      <label>
        Campaign name
        <input
          name="name"
          maxLength={120}
          defaultValue={campaign?.name}
          required
          placeholder="Thanksgiving 2027"
        />
      </label>
      <label>
        Subject
        <input
          name="subject"
          maxLength={150}
          defaultValue={campaign?.subject}
          required
        />
      </label>
      <label>
        Email message
        <textarea
          name="body"
          rows={5}
          minLength={10}
          maxLength={10000}
          defaultValue={campaign?.body}
          required
          placeholder="Write your promotion here. The booking button and unsubscribe footer are added automatically."
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label>
          Send on
          <input
            name="sendDate"
            type="date"
            required
            defaultValue={campaign?.scheduledAt.toISOString().slice(0, 10)}
          />
        </label>
        <label>
          Exclude stays from
          <input
            name="excludeStart"
            type="date"
            required
            defaultValue={campaign?.excludeStart}
          />
        </label>
        <label>
          Through (inclusive)
          <input
            name="excludeEnd"
            type="date"
            required
            defaultValue={campaign?.excludeEnd}
          />
        </label>
      </div>
    </>
  );
}
