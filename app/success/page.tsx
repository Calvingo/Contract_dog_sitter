import SuccessContent from "./SuccessContent";

export default async function SuccessPage({ searchParams }: {
  searchParams: Promise<{ emailWarning?: string; waitlisted?: string }>;
}) {
  const params = await searchParams;
  return <SuccessContent emailWarning={Boolean(params.emailWarning)} waitlisted={params.waitlisted === "1"} />;
}
