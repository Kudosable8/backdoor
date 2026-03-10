import type { ParsedCsv } from "./types";

export function parseCsv(content: string): ParsedCsv {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const flushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const flushRow = () => {
    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      flushField();
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      flushField();
      flushRow();
      continue;
    }

    currentField += character;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    flushField();
    flushRow();
  }

  const [headerRow = [], ...dataRows] = rows.filter((row) =>
    row.some((value) => value.trim().length > 0),
  );
  const headers = headerRow.map((header, index) =>
    header.trim() || `column_${index + 1}`,
  );
  const parsedRows = dataRows.map((row) => {
    const parsedRow: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      parsedRow[header] = row[headerIndex]?.trim() ?? "";
    });

    return parsedRow;
  });

  return {
    headers,
    rows: parsedRows,
  };
}
