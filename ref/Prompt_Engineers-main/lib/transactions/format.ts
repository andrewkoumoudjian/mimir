const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
});

const monthDayFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const longDateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatPercent(value: number) {
  return percentFormatter.format(value);
}

export function formatCompactDate(date: string) {
  return monthDayFormatter.format(parseDateOnly(date));
}

export function formatDisplayDateRange(startDate: string, endDate: string) {
  return `${longDateFormatter.format(parseDateOnly(startDate))} - ${longDateFormatter.format(
    parseDateOnly(endDate),
  )}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}
