import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/auth/admin-session";
import { allowRequest } from "@/lib/platform/rate-limit";
import { getMarketingConfig } from "./config";
import { deliverEmail, ProviderError } from "./provider";
import { BOOKING_WEBSITE, emailContent } from "./templates";

export async function sendCampaignTest(
  campaignId: string,
  email: string,
  send = deliverEmail,
) {
  if (!isAdminEmail(email))
    throw new Error("Test emails can only go to an approved admin mailbox.");
  const config = await getMarketingConfig();
  if (!config.mailReady)
    throw new Error(
      "Complete the sender, business mailing address and public website URL before sending a test.",
    );
  const campaign = await prisma.marketingCampaign.findUniqueOrThrow({
    where: { id: campaignId },
  });
  if (!(await allowRequest("marketing-test", email, 1, 300)))
    throw new Error("Wait five minutes before sending another test email.");
  const record = await prisma.marketingTest.create({
    data: { campaignId, email },
  });
  const preview = emailContent(
    campaign.body,
    BOOKING_WEBSITE,
    `${config.baseUrl}/account/profile`,
    config.address,
    {
      firstName: "Chieh",
      petName: "pocky",
      imageUrl: campaign.imagePath
        ? `${config.baseUrl}${campaign.imagePath}`
        : null,
    },
  );
  const notice =
    "TEST PREVIEW — sent only to your admin mailbox. No customer was contacted. The footer link opens email preferences; it does not unsubscribe a customer.";
  try {
    await send(
      {
        from: config.from,
        to: [email],
        subject: `[TEST] ${campaign.subject}`,
        html: `<p style="padding:12px;background:#fff4d6;font:13px Arial">${notice}</p>${preview.html}`,
        text: `${notice}\n\n${preview.text}`,
        headers: {},
      },
      `marketing-test-${record.id}`,
    );
    await prisma.marketingTest.update({
      where: { id: record.id },
      data: {
        status: "ACCEPTED",
        detail: "Accepted by the mail server. Check the admin inbox.",
      },
    });
    return `Test email sent to ${email}. No customer emails were sent.`;
  } catch (error) {
    const ambiguous = !(error instanceof ProviderError) || error.ambiguous;
    await prisma.marketingTest.update({
      where: { id: record.id },
      data: {
        status: ambiguous ? "UNKNOWN" : "FAILED",
        detail: ambiguous
          ? "Delivery uncertain. Check your mailbox before retrying."
          : (error as Error).message,
      },
    });
    throw new Error(
      ambiguous
        ? "Test delivery could not be confirmed. Check your mailbox before retrying."
        : (error as Error).message,
    );
  }
}
