import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { paymentSummary } from "@/lib/platform/rules";
import type { DepositPolicy } from "@/lib/federal-holidays";
import { AdminShell, Stat, money } from "../admin-ui";

export default async function PaymentsPage() {
  const admin = await requirePlatformAdmin();
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { submission: { include: { customer: true } } },
  });
  const summary = paymentSummary(payments);
  return (
    <AdminShell
      email={admin.email}
      title="Payment reports"
      subtitle="Payment notifications and historical records. All payments and refunds are handled offline."
    >
      <div className="notice">
        Customer notifications do not confirm receipt. These figures summarize
        website records and are not a reconciled balance of your payment accounts.
      </div>
      <section className="metric-grid">
        <Stat label="Payment notifications" value={String(summary.reportedCount)} />
        <Stat label="Reported amount · unverified" value={money(summary.reportedAmount)} />
        <Stat label="Historical verified amount" value={money(summary.historicalVerifiedAmount)} />
        <Stat label="Historical refunded amount" value={money(summary.historicalRefundedAmount)} />
      </section>
      <div className="booking-grid">
        {payments.length ? payments.map((payment) => {
          const booking = payment.submission;
          const policy = (booking.acceptedRevision !== null
            ? booking.acceptedDepositPolicySnapshot : booking.depositPolicySnapshot) as DepositPolicy | null;
          return (
            <section className="panel" key={payment.id}>
              <span className="pill">{payment.status}</span>
              <h2>{booking.customer.firstName} {booking.customer.lastName}</h2>
              <p>
                {payment.method === "TRANSFER" ? "Transfer" : payment.method} · {money(payment.amount)}
                {payment.payerName && <> · Payer: {payment.payerName}</>}
              </p>
              <p className="small">
                Recorded: {payment.createdAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
              </p>
              {payment.reference && <p className="small">Reference: {payment.reference}</p>}
              {policy?.nonRefundable && <p className="notice">
                Non-refundable deposit under the signed holiday policy: {money(policy.nonRefundableAmount)}.
                Any refund of other funds is handled offline.
              </p>}
              <p className="small">Booking status: {booking.status}</p>
              <Link className="text-link" href={`/admin/submissions/${payment.submissionId}`}>
                Review booking →
              </Link>
              {payment.reviewNote && <p className="small">{payment.reviewNote}</p>}
            </section>
          );
        }) : (
          <section className="panel empty-state">
            <h2>No payment records yet.</h2>
            <p>Customer payment notifications will appear here after an approved booking.</p>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
