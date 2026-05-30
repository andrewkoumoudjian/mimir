import { NextResponse } from "next/server";
import { evaluatePreApproval } from "@/lib/pre-approval/evaluate-pre-approval";
import { buildExpenseRequest } from "@/lib/pre-approval/mock-enrichment";
import { getDashboardData } from "@/lib/transactions/get-dashboard-data";
import type { ExpenseRequestInput } from "@/types/pre-approval";

export async function POST(request: Request) {
  let input: ExpenseRequestInput;

  try {
    input = (await request.json()) as ExpenseRequestInput;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!input?.employeeId || !input?.departmentId || !input?.approverId) {
    return NextResponse.json(
      { error: "Employee, department, and approver are required." },
      { status: 400 },
    );
  }

  if (!input?.expenseType || !input?.requestDate || !input?.currency) {
    return NextResponse.json(
      { error: "Expense type, request date, and currency are required." },
      { status: 400 },
    );
  }

  const normalizedRequest = buildExpenseRequest(input);
  const dashboard = await getDashboardData();
  const evaluation = evaluatePreApproval(normalizedRequest, dashboard.transactions);

  return NextResponse.json(evaluation);
}
