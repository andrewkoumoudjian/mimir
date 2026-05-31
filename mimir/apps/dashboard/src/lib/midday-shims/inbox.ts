export function getInboxEmail(inboxId?: string | null) {
  return `${inboxId || "mimir"}@inbox.mimir.local`;
}
