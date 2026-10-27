/**
 * Minimal CSV utilities — RFC4180-lite parser + writer.
 * Hackathon scale ke liye dependency-free, quotes/commas/newlines handle karta hai.
 */

/**
 * CSV text → array of objects (first row = header).
 * - Double quotes se wrapped fields support karta hai ("a,b" ek field)
 * - "" escaped quote support karta hai
 * - \r\n aur \n dono
 * Returns { headers: string[], rows: Array<Record<string,string>> }
 */
export function parseCsv(text) {
  const clean = String(text ?? "").replace(/^\uFEFF/, ""); // BOM strip
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
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
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n") {
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else if (ch === "\r") {
      // \r\n — \n par handle ho jayega, akela \r bhi newline treat karein
      if (clean[i + 1] !== "\n") {
        record.push(field);
        field = "";
        records.push(record);
        record = [];
      }
    } else {
      field += ch;
    }
  }

  // last record (agar trailing newline nahi)
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  // empty trailing lines drop
  const meaningful = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (meaningful.length === 0) return { headers: [], rows: [] };

  const headers = meaningful[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = meaningful.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

/** Cell value CSV-escape (comma, quote, newline). */
function escapeCell(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Array of objects → CSV text (headers order given). */
export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }
  return lines.join("\r\n");
}

/** Employee CSV template — import page "Download template" isko use karta hai. */
export const EMPLOYEE_CSV_HEADERS = [
  "full_name",
  "email",
  "phone",
  "gender",
  "department",
  "designation",
  "join_date",
  "basic_salary",
  "address",
];

export function employeeCsvTemplate() {
  return toCsv(EMPLOYEE_CSV_HEADERS, [
    {
      full_name: "Ali Raza",
      email: "ali.raza@company.com",
      phone: "+92 300 1234567",
      gender: "male",
      department: "Engineering",
      designation: "Senior Software Engineer",
      join_date: "2026-01-15",
      basic_salary: 150000,
      address: "Gulshan-e-Iqbal, Karachi",
    },
    {
      full_name: "Sara Khan",
      email: "sara.khan@company.com",
      phone: "+92 301 7654321",
      gender: "female",
      department: "Engineering",
      designation: "",
      join_date: "2026-02-01",
      basic_salary: 120000,
      address: "",
    },
  ]);
}
