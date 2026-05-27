import Link from "next/link";
import {
  decisionResultMessage,
  processDecision,
} from "@/lib/decision-handler";

type Props = {
  searchParams: Promise<{ action?: string; token?: string }>;
};

export default async function DecisionPage({ searchParams }: Props) {
  const params = await searchParams;
  const { action, token } = params;

  console.info("[decision-page] request", {
    action,
    hasToken: Boolean(token),
  });

  if (!action || !token) {
    return (
      <ResultLayout
        success={false}
        title="Missing information"
        message="This link is incomplete. Please use the full link from the admin notification email."
      />
    );
  }

  try {
    const result = await processDecision(token, action);
    const { title, message, success } = decisionResultMessage(result);

    if (!result.ok) {
      console.warn("[decision-page] failed", { title });
    } else {
      console.info("[decision-page] success", { action: result.action });
    }

    return (
      <ResultLayout success={success} title={title} message={message} />
    );
  } catch (error) {
    console.error("[decision-page] error", error);
    const detail =
      error instanceof Error ? error.message : "Unknown server error";
    return (
      <ResultLayout
        success={false}
        title="Something went wrong"
        message={`Could not send the customer email. ${detail}`}
      />
    );
  }
}

function ResultLayout({
  success,
  title,
  message,
}: {
  success: boolean;
  title: string;
  message: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff5f0] px-4 py-10">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-orange-100">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
            success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {success ? "✓" : "✕"}
        </div>
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        <p className="mt-3 text-stone-600">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Back to form
        </Link>
      </div>
    </main>
  );
}
