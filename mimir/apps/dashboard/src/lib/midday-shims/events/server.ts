export async function setupAnalytics() {
  return {
    track: (_options: Record<string, unknown>) => undefined,
  };
}
