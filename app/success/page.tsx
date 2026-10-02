import SuccessContent from "./SuccessContent";

export default async function SuccessPage({ searchParams }: {
  searchParams: Promise<{ emailWarning?: string }>;
}) {
  return <SuccessContent emailWarning={Boolean((await searchParams).emailWarning)} />;
}
