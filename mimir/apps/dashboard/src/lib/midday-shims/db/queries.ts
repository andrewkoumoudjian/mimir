export type BankAccountWithPaymentInfo = Record<string, unknown>;
export type BillableHoursResult = {
  totalDuration: number;
  totalAmount: number;
  currency: string;
  projectBreakdown: Array<Record<string, unknown>>;
};
