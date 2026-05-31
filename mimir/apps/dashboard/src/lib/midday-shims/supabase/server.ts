import { createFakeSupabaseClient } from "./fake-client";

export async function createClient() {
  return createFakeSupabaseClient();
}
