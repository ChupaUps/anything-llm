/**
 * Minimal CSV helpers for the in-chat spreadsheet preview. We persist sheet data
 * as CSV text, so parsing it here avoids shipping a heavyweight dependency.
 */

/**
 * Guess the delimiter used in a CSV blob by counting likely separators on the
 * first non-empty line, honouring double quotes.
 * @param {string} text
 * @returns {string} one of ",", ";", "\t", "|"
 */
export function detectDelimiter(text) {
  const firstLine = (text || "").split(/\r?\n/).find((l) => l.length > 0) || "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === delim && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }
  return best;
}

/**
 * Parse CSV text into a matrix of string cells. Handles quoted fields, escaped
 * double-quotes and both LF/CRLF line endings.
 * @param {string} text
 * @param {string} [delimiter] - auto-detected when omitted
 * @returns {string[][]}
 */
export function parseCsv(text, delimiter) {
  const delim = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const input = text ?? "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
