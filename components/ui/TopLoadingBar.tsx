"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { shouldStartTopLoadingForFormAction, shouldStartTopLoadingForHref } from "@/lib/navigation/topLoading";

const FALLBACK_HIDE_MS = 8000;
const MIN_VISIBLE_MS = 420;
const COMPLETE_HIDE_MS = 220;
const TRICKLE_MS = 360;
const MAX_TRICKLE_PROGRESS = 92;

function currentHref() {
  return window.location.href;
}

export function TopLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedRef = useRef(false);
  const startedAtRef = useRef(0);
  const fallbackTimerRef = useRef<number>();
  const completeTimerRef = useRef<number>();
  const trickleTimerRef = useRef<number>();

  useEffect(() => {
    const stopTimers = () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
      if (trickleTimerRef.current) window.clearInterval(trickleTimerRef.current);
    };

    const start = () => {
      stopTimers();
      startedRef.current = true;
      startedAtRef.current = Date.now();
      setActive(true);
      setProgress(12);
      window.requestAnimationFrame(() => setProgress(32));
      trickleTimerRef.current = window.setInterval(() => {
        setProgress((current) => Math.min(MAX_TRICKLE_PROGRESS, current + Math.max(2, (MAX_TRICKLE_PROGRESS - current) * 0.18)));
      }, TRICKLE_MS);
      fallbackTimerRef.current = window.setTimeout(() => {
        startedRef.current = false;
        setProgress(100);
        setActive(false);
        setProgress(0);
      }, FALLBACK_HIDE_MS);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target && target.target !== "_self") return;
      if (target.hasAttribute("download")) return;
      if (shouldStartTopLoadingForHref(target.getAttribute("href"), currentHref())) start();
    };

    const handleSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      const method = (form.getAttribute("method") || "get").toLowerCase();
      if (method !== "get") return;
      if (form.target && form.target !== "_self") return;
      if (shouldStartTopLoadingForFormAction(form.getAttribute("action"), currentHref())) start();
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      stopTimers();
    };
  }, []);

  useEffect(() => {
    if (!startedRef.current) return;
    if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
    if (trickleTimerRef.current) window.clearInterval(trickleTimerRef.current);
    const elapsed = Date.now() - startedAtRef.current;
    const wait = Math.max(COMPLETE_HIDE_MS, MIN_VISIBLE_MS - elapsed);
    setProgress(100);
    completeTimerRef.current = window.setTimeout(() => {
      startedRef.current = false;
      setActive(false);
      window.setTimeout(() => setProgress(0), 160);
    }, wait);
  }, [pathname, searchParams]);

  return (
    <div className={`top-loading-bar ${active ? "top-loading-bar--active" : ""}`} style={{ "--top-loading-progress": `${progress}%` } as CSSProperties} aria-hidden="true" data-testid="top-loading-bar">
      <span />
    </div>
  );
}
