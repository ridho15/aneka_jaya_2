"use client";

import { useEffect, useState } from "react";

const PREFIX = "slm.inventory.location.";

function read(scope: string) {
  try {
    return window.localStorage.getItem(PREFIX + scope) ?? "";
  } catch {
    return "";
  }
}

function write(scope: string, id: string) {
  try {
    if (id) window.localStorage.setItem(PREFIX + scope, id);
  } catch {
    // Mode privat / storage diblokir: lokasi cukup tidak diingat.
  }
}

/**
 * Lokasi terakhir yang dipakai di perangkat ini, per jenis form.
 * Dibaca setelah mount agar render server dan klien tetap sama.
 */
export function useRememberedLocation(scope: string, validIds: string[], initial = "") {
  const [value, setValue] = useState(initial);
  const key = validIds.join(",");
  useEffect(() => {
    if (initial) return;
    const saved = read(scope);
    if (saved && key.split(",").includes(saved)) setValue(saved);
  }, [scope, key, initial]);
  const update = (id: string) => {
    setValue(id);
    write(scope, id);
  };
  return [value, update] as const;
}
