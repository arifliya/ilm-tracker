// Small RFC4180-ish CSV parser — handles quoted fields (including embedded
// commas/newlines) and escaped "" quotes, which a naive split(",") breaks
// on. Client-side only, deliberately not a library: covers standard
// spreadsheet-exported CSVs (Excel/Sheets), the realistic input for the
// bulk student upload this was built for.

const parseRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // Final field/row, unless the file ended cleanly on a newline (in which
  // case endRow() already ran and there's nothing left to flush).
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
};

/**
 * Parses CSV text into an array of objects keyed by the header row. Every
 * field is trimmed of leading/trailing whitespace (accidental spreadsheet
 * padding) — embedded commas/newlines inside quoted fields are still
 * preserved structurally, only surrounding whitespace is stripped. Fully
 * blank rows are skipped.
 */
export const parseCsv = (text: string): Record<string, string>[] => {
  const rawRows = parseRows(text).filter(r => !(r.length === 1 && r[0].trim() === ""));
  if (rawRows.length === 0) return [];

  const headers = rawRows[0].map(h => h.trim());
  return rawRows.slice(1).map(r => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (r[idx] ?? "").trim();
    });
    return record;
  });
};
