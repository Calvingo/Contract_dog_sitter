import { unsubscribeCustomer } from "@/lib/marketing/unsubscribe";
import { ActionForm } from "@/components/ActionForm";
import { unsubscribeAction } from "./unsubscribe-action";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Email preferences | Silicon Paws Retreat",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token || "";
  const customer = await unsubscribeCustomer(token);
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <section className="panel">
        <h1>Email preferences</h1>
        {customer ? (
          <>
            <p>
              Stop receiving promotional emails from Silicon Paws Retreat. Your
              booking confirmations and account emails will continue.
            </p>
            <ActionForm
              action={unsubscribeAction}
              label="Unsubscribe from promotions"
            >
              <input type="hidden" name="token" value={token} />
            </ActionForm>
          </>
        ) : (
          <p>
            This link is invalid. You can update your email preferences in your
            account.
          </p>
        )}
        <a href="/account/profile">Manage account preferences</a>
      </section>
    </main>
  );
}
