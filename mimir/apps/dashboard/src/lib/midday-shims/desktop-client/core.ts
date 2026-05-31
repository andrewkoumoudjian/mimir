const currentWindow = {
    label: "main",
    emit: async () => undefined,
    listen: async () => () => undefined,
    show: async () => undefined,
    setFocus: async () => undefined,
};

export const Window = {
  getCurrent: async () => currentWindow,
  getByLabel: async () => currentWindow,
};

export async function emit() {
  return undefined;
}

export async function invoke() {
  return undefined;
}

export async function listen() {
  return () => undefined;
}

export async function openUrl(url: string) {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function getCurrentWindow() {
  return currentWindow;
}

export async function nativeSaveFile() {
  return undefined;
}
