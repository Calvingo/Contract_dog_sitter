"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { decideSubmissionActionWithState } from "@/app/admin/actions";
import { bookingDecisionActions } from "@/lib/admin/booking-actions";

export function BookingRequestActions({
  id,
  status,
  revision,
  showEdit = true,
}: {
  id: string;
  status: string;
  revision: number;
  showEdit?: boolean;
}) {
  const [state, action, pending] = useActionState(
    decideSubmissionActionWithState,
    {},
  );
  const [schedule, setSchedule] = useState(false);
  const allowed = bookingDecisionActions(status);
  return (
    <div className="request-actions">
      {allowed.length > 0 && (
        <form action={action}>
          <input type="hidden" name="submissionId" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="expectedStatus" value={status} />
          <fieldset disabled={pending} className="form-stack">
            <div className="flex flex-wrap gap-2">
              <button
                className="button"
                name="action"
                value="accept"
                formNoValidate
              >
                Accept
              </button>
              <button
                className="button secondary"
                name="action"
                value="reject"
                formNoValidate
              >
                Reject
              </button>
            </div>
            {allowed.includes("meet_greet") && (
              <>
                <button
                  type="button"
                  className="text-link"
                  aria-expanded={schedule}
                  onClick={() => setSchedule(!schedule)}
                >
                  {schedule ? "Hide meet & greet" : "Schedule meet & greet"}
                </button>
                {schedule && (
                  <div className="form-stack">
                    <label>
                      Meet & greet time (Pacific)
                      <input
                        type="datetime-local"
                        name="meetGreetAt"
                        required
                      />
                    </label>
                    <button
                      className="button secondary"
                      name="action"
                      value="meet_greet"
                    >
                      Send meet & greet
                    </button>
                  </div>
                )}
              </>
            )}
            {pending && <p role="status">Saving decision…</p>}
          </fieldset>
        </form>
      )}
      {status === "MEET_GREET_REQUESTED" && (
        <p className="small">
          Meet & greet requested. Accept or reject after your review.
        </p>
      )}
      {showEdit ? (
        <Link href={`/admin/submissions/${id}`} className="button secondary">
          Edit
        </Link>
      ) : (
        allowed.length === 0 && (
          <p className="small">
            Decision recorded. Use Edit Order below to make changes.
          </p>
        )
      )}
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="notice">
          {state.message}
        </p>
      )}
    </div>
  );
}
