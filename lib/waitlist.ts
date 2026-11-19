export const WAITLIST_NOTICE_ZH = "您选择的日期中，Silicon Paws Retreat 已经满员。您的预约申请将进入 waiting list，暂不保证被接受。如果有客户取消、空出位置，我们会第一时间联系您。";
export const WAITLIST_NOTICE = "Silicon Paws Retreat is fully booked for some of your selected dates. Your request will join our waiting list and is not guaranteed to be accepted. If a cancellation opens up space, we will contact you as soon as possible.";
export const WAITLIST_SAVED = "Your request is on our waiting list and is not confirmed. We will contact you if space becomes available. Please wait for our acceptance before paying a deposit.";

// Membership is independent of review/meet-and-greet status and never expires.
export function isWaitlisted(booking: { waitlistedAt?: Date | string | null; status: string }) {
  return Boolean(booking.waitlistedAt) && !["ACCEPTED", "REJECTED", "CANCELLED"].includes(booking.status);
}

export function waitlistDecisionNote(booking: { waitlistedAt?: Date | null; status: string }) {
  return isWaitlisted(booking) ? ` Waiting-list request joined ${booking.waitlistedAt!.toISOString()}.` : "";
}
