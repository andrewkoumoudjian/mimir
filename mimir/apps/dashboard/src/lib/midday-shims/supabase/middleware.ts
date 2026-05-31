import { type NextRequest, NextResponse } from "next/server";
import { createFakeSupabaseClient } from "./fake-client";

export async function updateSession(
  _request: NextRequest,
  response: NextResponse,
) {
  return {
    response,
    isAuthenticated: true,
    supabase: createFakeSupabaseClient(),
  };
}
