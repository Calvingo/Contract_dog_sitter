"use client";

import { useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

type Props = {
  onChange: (value: string) => void;
  clearLabel: string;
  disabled?: boolean;
  disabledMessage?: string;
};

export function SignaturePad({
  onChange,
  clearLabel,
  disabled = false,
  disabledMessage,
}: Props) {
  const canvasRef = useRef<SignatureCanvas | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleEnd = () => {
      if (canvas.isEmpty()) {
        onChangeRef.current("");
        return;
      }
      onChangeRef.current(canvas.toDataURL("image/png"));
    };

    const pad = canvas.getCanvas();
    pad.addEventListener("mouseup", handleEnd);
    pad.addEventListener("touchend", handleEnd);

    return () => {
      pad.removeEventListener("mouseup", handleEnd);
      pad.removeEventListener("touchend", handleEnd);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      canvasRef.current?.clear();
      onChangeRef.current("");
    }
  }, [disabled]);

  const handleClear = () => {
    canvasRef.current?.clear();
    onChangeRef.current("");
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-xl border border-dashed ${
          disabled
            ? "border-stone-300 bg-stone-100"
            : "border-orange-200 bg-white"
        }`}
      >
        <SignatureCanvas
          ref={canvasRef}
          penColor="#1c1917"
          canvasProps={{
            className: "h-44 w-full touch-none",
          }}
        />
        {disabled ? (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-100/85 px-4 text-center text-sm font-medium text-stone-600">
            {disabledMessage}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleClear}
        disabled={disabled}
        className="rounded-lg border border-orange-200 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400 disabled:hover:bg-transparent"
      >
        {clearLabel}
      </button>
    </div>
  );
}
