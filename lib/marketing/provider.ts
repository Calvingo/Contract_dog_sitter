import { createMailer } from "@/lib/mailer";
export type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};
export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public ambiguous: boolean,
  ) {
    super(message);
  }
}
export async function deliverEmail(
  payload: EmailPayload,
  key: string,
): Promise<string> {
  const transporter = createMailer();
  try {
    const result = await transporter.sendMail({
      ...payload,
      messageId: `<${key}@siliconpaws.local>`,
    });
    if (!result.accepted?.length)
      throw new ProviderError(
        "The mail server did not accept this recipient.",
        false,
        false,
      );
    return result.messageId;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const smtp = error as { responseCode?: number; code?: string };
    // An explicit SMTP negative response means the server did not accept the mail.
    if (
      smtp.responseCode &&
      smtp.responseCode >= 400 &&
      smtp.responseCode < 600
    ) {
      throw new ProviderError(
        `Mail server rejected the message (SMTP ${smtp.responseCode}).`,
        smtp.responseCode < 500,
        false,
      );
    }
    if (["EAUTH", "ENOTFOUND", "ECONNREFUSED"].includes(smtp.code || ""))
      throw new ProviderError(
        `Mail connection failed (${smtp.code}).`,
        smtp.code !== "EAUTH",
        false,
      );
    // SMTP cannot provide exactly-once delivery after a lost connection. Never auto-retry.
    throw new ProviderError(
      "Delivery could not be confirmed. Check the mailbox before resolving this record.",
      false,
      true,
    );
  } finally {
    transporter.close();
  }
}
