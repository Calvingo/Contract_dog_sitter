"use client";

import { useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

type Props = {
  onChange: (value: string) => void;
  clearLabel: string;
};

export function SignaturePad({ onChange, clearLabel }: Props) {
  const canvasRef = useRef<SignatureCanvas | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleEnd = () => {
      if (canvas.isEmpty()) {
        onChange("");
        return;
      }
      onChange(canvas.toDataURL("image/png"));
    };

    const pad = canvas.getCanvas();
    pad.addEventListener("mouseup", handleEnd);
    pad.addEventListener("touchend", handleEnd);

    return () => {
      pad.removeEventListener("mouseup", handleEnd);
      pad.removeEventListener("touchend", handleEnd);
    };
  }, [onChange]);

  const handleClear = () => {
    canvasRef.current?.clear();
    onChange("");
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-dashed border-orange-200 bg-white">
        <SignatureCanvas
          ref={canvasRef}
          penColor="#1c1917"
          canvasProps={{
            className: "h-44 w-full touch-none",
          }}
        />
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="rounded-lg border border-orange-200 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
      >
        {clearLabel}
      </button>
    </div>
  );
}
