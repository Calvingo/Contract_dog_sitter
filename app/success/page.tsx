import { Suspense } from "react";
import SuccessContent from "./SuccessContent";

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fff5f0]" />}>
      <SuccessContent />
    </Suspense>
  );
}
