import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { AdminShell, money } from "../admin-ui";
import { reviewPayment } from "../platform-actions";
export default async function PaymentsPage() {
  const admin = await requirePlatformAdmin();
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { submission: { include: { customer: true } } },
  });
  return (
    <AdminShell
      email={admin.email}
      title="Payments"
      subtitle="Customer payment notifications and refund history. Payment notifications do not prove receipt."
    >
      <div className="notice">
        Refunds must be sent in your payment app first. Recording a refund here
        does not transfer money. Accepted bookings remain confirmed independently of payment.
      </div>
      <div className="booking-grid">
        {payments.length ? (
          payments.map((payment) => (
            <section className="panel" key={payment.id}>
              <span className="pill">{payment.status}</span>
              <h2>
                {payment.submission.customer.firstName}{" "}
                {payment.submission.customer.lastName}
              </h2>
              <p>
                {payment.method === "TRANSFER" ? "Transfer" : payment.method} · {money(payment.amount)}
                {payment.payerName && <> · Payer: {payment.payerName}</>}
              </p>
              {payment.reference && (
                <p className="small">Reference: {payment.reference}</p>
              )}
              {payment.submission.acceptedDepositPolicySnapshot && <p className="notice">Holiday deposit retained: ${Number((payment.submission.acceptedDepositPolicySnapshot as {nonRefundableAmount?:number}).nonRefundableAmount || 0).toFixed(2)}. Record only funds actually refunded; other amounts remain separate from the deposit.</p>}
              <p className="small">
                Booking status: {payment.submission.status}
              </p>
              <Link
                className="text-link"
                href={`/admin/submissions/${payment.submissionId}`}
              >
                Review booking →
              </Link>
              {["REPORTED", "VERIFIED"].includes(payment.status) ? (
                <ActionForm action={reviewPayment} label="Record refund">
                  <input type="hidden" name="id" value={payment.id} />
                  <label>
                    Result
                    <select name="status" defaultValue="" required>
                      <option value="" disabled>
                        Select result
                      </option>
                      <option value="REFUNDED">Record actual refund</option>
                    </select>
                  </label>
                  {(
                    <label>
                      Actual refund amount ($)
                      <input
                        type="number"
                        name="amount"
                        defaultValue={Number(payment.amount)}
                        min="0.01"
                        max="100000"
                        step="0.01"
                        required
                      />
                    </label>
                  )}
                  <label>
                    Customer-visible note / refund reference
                    <textarea name="note" maxLength={1000} rows={2} />
                  </label>
                  <label className="check-label">
                    <input type="checkbox" name="checked" required />
                    <span>
                      I checked the actual transfer or completed the refund
                      in the payment app.
                    </span>
                  </label>
                </ActionForm>
              ) : (
                <p className="small">{payment.reviewNote}</p>
              )}
            </section>
          ))
        ) : (
          <section className="panel empty-state">
            <h2>No payments to review yet.</h2>
            <p>
              Customer payment reports will appear here after an approved
              booking.
            </p>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
