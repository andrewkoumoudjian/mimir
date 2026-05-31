export function isDesktopApp() {
  return false;
}

export function isDesktopAppUserAgent() {
  return false;
}

export function getDesktopSchemeUrl(path = "") {
  return `mimir://${path.replace(/^\//, "")}`;
}

export async function listenForDeepLinks() {
  return () => undefined;
}
