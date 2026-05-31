export function formatAmountValue({ amount }: { amount: string | number }) {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(value) ? value : null;
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
