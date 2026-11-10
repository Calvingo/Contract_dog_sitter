import type { Payment } from "@prisma/client";
import { ActionForm } from "@/components/ActionForm";
import { recordOfflinePayment } from "../receipt-actions";

export function OfflineReceipts({ id, accepted, payments }: { id: string; accepted: boolean; payments: Payment[] }) {
  return <section className="panel">
    <h2>Offline receipts and refunds</h2>
    {payments.map(payment => <div key={payment.id} className="border-b py-3">
      <p>{payment.status} · ${payment.amount.toFixed(2)} · {payment.reference || "Customer notification"}</p>
      {payment.status === "VERIFIED" && <>
        <p className="small">Refunded to date: ${payment.refundedAmount.toFixed(2)}</p>
        {payment.amount.gt(payment.refundedAmount) && <details>
          <summary>Record an offline refund</summary>
          <ActionForm action={recordOfflinePayment} label="Save refund total">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="paymentId" value={payment.id} />
            <input type="hidden" name="operation" value="refund" />
            <input type="hidden" name="previousRefund" value={payment.refundedAmount.toFixed(2)} />
            <label>Total refunded on this receipt, including earlier refunds ($)
              <input name="amount" type="number" step="0.01" min={payment.refundedAmount.plus(0.01).toFixed(2)} max={payment.amount.toFixed(2)} required /></label>
            <label>Refund reference<input name="reference" maxLength={180} required /></label>
            <p className="small">For an early departure, also update the pickup time under Edit Order.</p>
          </ActionForm>
        </details>}
      </>}
    </div>)}
    {accepted && <details className="mt-3"><summary>Record money received offline</summary>
      <ActionForm action={recordOfflinePayment} label="Record confirmed receipt">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="operation" value="receipt" />
        <label>Transfer<select name="paymentId">
          <option value="">New offline receipt</option>
          {payments.filter(payment => payment.status === "REPORTED").map(payment =>
            <option key={payment.id} value={payment.id}>Customer notification · ${payment.amount.toFixed(2)}</option>)}
        </select></label>
        <label>Actual amount received ($)<input name="amount" type="number" step="0.01" min="0.01" required /></label>
        <label>Unique transfer reference<input name="reference" maxLength={180} required /></label>
      </ActionForm>
    </details>}
  </section>;
}
