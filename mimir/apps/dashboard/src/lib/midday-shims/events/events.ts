export const LogEvents = new Proxy(
  {},
  {
    get: (_target, prop) => ({
      name: String(prop),
      channel: "mimir",
    }),
  },
) as Record<string, { name: string; channel: string }>;
