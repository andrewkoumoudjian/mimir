import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/transactions/get-dashboard-data";

export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data);
}
