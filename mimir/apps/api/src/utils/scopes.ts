export const SCOPES = [
  "apis.all",
  "apis.read",
  "transactions.read",
  "transactions.write",
  "invoices.read",
  "invoices.write",
  "customers.read",
  "customers.write",
  "bank-accounts.read",
  "bank-accounts.write",
  "documents.read",
  "documents.write",
  "inbox.read",
  "inbox.write",
  "teams.read",
  "teams.write",
  "users.read",
  "users.write",
  "tracker-entries.read",
  "tracker-entries.write",
  "tracker-projects.read",
  "tracker-projects.write",
  "tags.read",
  "tags.write",
  "reports.read",
  "search.read",
  "notifications.read",
  "notifications.write",
] as const;

export type Scope = (typeof SCOPES)[number];

export type ScopePreset = "all_access" | "read_only" | "restricted";

export const availableScopes: Scope[] = [...SCOPES];

export const scopePresets: Array<{
  value: ScopePreset;
  label: string;
  description: string;
}> = [
  {
    value: "all_access",
    label: "All access",
    description: "full access to all resources",
  },
  {
    value: "read_only",
    label: "Read only",
    description: "read-only access to all resources",
  },
  {
    value: "restricted",
    label: "Restricted",
    description: "custom access to selected resources",
  },
];

export function scopesToName(scopes: string[] = []) {
  if (scopes.includes("apis.all")) {
    return { name: "All access", preset: "all_access" as ScopePreset };
  }

  if (scopes.includes("apis.read")) {
    return { name: "Read only", preset: "read_only" as ScopePreset };
  }

  return {
    name: scopes.length
      ? scopes.map((scope) => scopeToName(scope)).join(", ")
      : "Restricted",
    preset: "restricted" as ScopePreset,
  };
}

export function scopeToName(scope: string) {
  return scope.replace(".", ": ");
}
