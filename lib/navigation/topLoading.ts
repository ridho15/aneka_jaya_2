export function shouldStartTopLoadingForHref(href: string | null | undefined, currentHref: string) {
  if (!href) return false;
  const normalizedHref = href.trim();
  if (!normalizedHref || normalizedHref.startsWith("#")) return false;
  if (/^(mailto|tel|sms|blob|data):/i.test(normalizedHref)) return false;

  let target: URL;
  let current: URL;
  try {
    current = new URL(currentHref, "http://localhost");
    target = new URL(normalizedHref, current);
  } catch {
    return false;
  }

  if (target.origin !== current.origin) return false;
  return target.pathname !== current.pathname || target.search !== current.search;
}

export function shouldStartTopLoadingForFormAction(action: string | null | undefined, currentHref: string) {
  if (!action) return true;
  return shouldStartTopLoadingForHref(action, currentHref);
}
