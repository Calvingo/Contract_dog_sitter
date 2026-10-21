"use client";

import { useEffect, useState } from "react";
import { todayKey } from "@/lib/platform/rules";

export function useCaliforniaToday() {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    const refresh = () => setToday(todayKey());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
