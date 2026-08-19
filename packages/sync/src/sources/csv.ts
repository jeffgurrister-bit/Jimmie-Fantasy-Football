/**
 * Minimal RFC 4180 CSV reader. Handles quoted fields containing commas,
 * newlines and escaped quotes — all of which turn up in a sheet where someone
 * has typed a power-rankings blurb into a cell.
 *
 * Hand-rolled rather than a dependency: it is thirty lines, it is exercised by
 * tests, and one less package is one less thing to break after handoff.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM, which Google's CSV export includes.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // A trailing newline should not produce a spurious empty final row.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
