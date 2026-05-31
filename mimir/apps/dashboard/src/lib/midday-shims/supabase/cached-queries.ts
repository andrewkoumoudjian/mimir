import { createFakeSupabaseClient } from "./fake-client";

export async function getSession() {
  const supabase = createFakeSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const supabase = createFakeSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
