import Link from "next/link";
import { prisma } from "@/lib/db";
import { ActionForm } from "./ActionForm";
import { acknowledgeWaitlistAlert } from "@/app/admin/waitlist-actions";

export async function WaitlistAlerts() {
  const alerts = await prisma.waitlistAlert.findMany({ where: { acknowledgedAt: null }, orderBy: { createdAt: "desc" }, take: 10 });
  if (!alerts.length) return null;
  return <section className="panel" aria-label="Waiting list reminders">
    <h2>Space opened up — review the waiting list</h2>
    <p className="small">Availability below is from the time of each change. Review the full stay and contact customers before accepting.</p>
    {alerts.map(alert => <div key={alert.id} className="notice">
      <p><strong>{alert.reason}</strong> · {alert.createdAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} Pacific</p>
      <p>{alert.candidateCount} waiting-list request(s) overlapped these dates. No requests were automatically accepted.</p>
      <div className="flex flex-wrap gap-3 my-2">
        {alert.dates.map(date => <Link key={date} className="text-link" href={`/admin/requests?view=waitlist&date=${date}`}>
          {date}: {(alert.remaining as Record<string, number>)[date]} space(s)
        </Link>)}
      </div>
      {alert.emailFailed && <p className="small">The email notification could not be completed. This reminder is saved here.</p>}
      <ActionForm action={acknowledgeWaitlistAlert} label="Mark reminder reviewed"><input type="hidden" name="id" value={alert.id} /></ActionForm>
    </div>)}
    {alerts.length === 10 && <p className="small">Showing the 10 latest reminders. Review these to see older reminders.</p>}
  </section>;
}
