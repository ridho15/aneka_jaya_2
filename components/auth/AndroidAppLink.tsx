"use client";

import { useEffect, useState } from "react";

/** Link unduh APK, hanya untuk browser HP Android (tidak tampil di dalam aplikasi SLM sendiri). */
export function AndroidAppLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setShow(/Android/i.test(ua) && !/SLMAndroid/.test(ua));
  }, []);
  if (!show) return null;
  return (
    <a
      href="/downloads/slm-android.apk"
      download
      className="mt-4 flex min-h-11 items-center justify-center rounded-sm border border-emerald-600 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
    >
      Unduh aplikasi Android SLM
    </a>
  );
}
