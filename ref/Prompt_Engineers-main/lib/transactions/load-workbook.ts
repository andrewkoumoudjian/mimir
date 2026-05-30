import { readFileSync } from "node:fs";
import { read, utils } from "xlsx";

export function loadWorkbookRows(filePath: string): Record<string, string>[] {
  const fileBuffer = readFileSync(filePath);
  const workbook = read(fileBuffer, {
    cellDates: false,
    raw: true,
    type: "buffer",
  });

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: true,
  });

  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)]),
    ),
  );
}
