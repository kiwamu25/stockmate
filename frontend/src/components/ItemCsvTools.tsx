import { useState } from "react";
import type { Item } from "../types/item";

type Category = Item["category"];
type ManagedUnit = Item["managed_unit"];

type ItemCsvToolsProps = {
  onImported?: () => Promise<void> | void;
};

type ParsedRow = {
  line: number;
  sku: string;
  name: string;
  payload: Record<string, unknown> | null;
  error: string;
};

function isDuplicateSkuError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("unique constraint failed") ||
    text.includes("duplicate") ||
    text.includes("already exists")
  );
}

const CATEGORY_HEADERS: Record<Category, string[]> = {
  material: [
    "sku",
    "name",
    "managed_unit",
    "pack_qty",
    "rev_code",
    "stock_managed",
    "note",
    "material_manufacturer",
    "material_type",
    "material_color",
  ],
  part: [
    "sku",
    "name",
    "managed_unit",
    "pack_qty",
    "rev_code",
    "stock_managed",
    "note",
    "part_manufacturer",
    "part_note",
  ],
  product: [
    "sku",
    "name",
    "managed_unit",
    "pack_qty",
    "rev_code",
    "stock_managed",
    "note",
    "product_total_weight",
    "product_pack_size",
    "product_note",
  ],
};

const TEMPLATE_ROWS: Record<Category, string[]> = {
  material: ["MAT-001", "PLA Black", "g", "1000", "A", "true", "", "Bambu Lab", "PLA", "Black"],
  part: ["PART-001", "M3 Screw", "pcs", "100", "A", "true", "", "Any Supplier", ""],
  product: ["PRD-001", "Phone Stand", "pcs", "10", "A", "true", "", "120", "10x8x12", ""],
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function parseOptionalPositiveNumber(text: string, field: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return n;
}

function parseManagedUnit(text: string): ManagedUnit {
  const unit = (text.trim() || "pcs") as ManagedUnit;
  if (unit !== "pcs" && unit !== "g") {
    throw new Error("managed_unit must be pcs or g.");
  }
  return unit;
}

function parseStockManaged(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (value === "") return true;
  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;
  throw new Error("stock_managed must be true/false (or 1/0).");
}

function buildPayload(category: Category, rowMap: Record<string, string>): Record<string, unknown> {
  const sku = (rowMap.sku ?? "").trim();
  const name = (rowMap.name ?? "").trim();
  if (!sku || !name) {
    throw new Error("sku and name are required.");
  }

  const payload: Record<string, unknown> = {
    sku,
    name,
    category,
    managed_unit: parseManagedUnit(rowMap.managed_unit ?? ""),
    pack_qty: parseOptionalPositiveNumber(rowMap.pack_qty ?? "", "pack_qty"),
    rev_code: (rowMap.rev_code ?? "").trim(),
    stock_managed: parseStockManaged(rowMap.stock_managed ?? ""),
    note: (rowMap.note ?? "").trim(),
  };

  if (category === "product") {
    payload.product = {
      total_weight: parseOptionalPositiveNumber(
        rowMap.product_total_weight ?? "",
        "product_total_weight",
      ),
      pack_size: (rowMap.product_pack_size ?? "").trim(),
      note: (rowMap.product_note ?? "").trim(),
    };
  } else if (category === "material") {
    payload.material = {
      manufacturer: (rowMap.material_manufacturer ?? "").trim(),
      material_type: (rowMap.material_type ?? "").trim(),
      color: (rowMap.material_color ?? "").trim(),
    };
  } else if (category === "part") {
    payload.part = {
      manufacturer: (rowMap.part_manufacturer ?? "").trim(),
      note: (rowMap.part_note ?? "").trim(),
    };
  }

  return payload;
}

export default function ItemCsvTools({ onImported }: ItemCsvToolsProps) {
  const [category, setCategory] = useState<Category>("product");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);

  function downloadTemplate(targetCategory: Category) {
    const header = CATEGORY_HEADERS[targetCategory];
    const sample = TEMPLATE_ROWS[targetCategory];
    const content =
      `${header.map(csvEscape).join(",")}\n${sample.map(csvEscape).join(",")}\n`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `item-template-${targetCategory}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function onSelectCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportError("");
    setImportSummary("");
    setPreviewRows([]);
    setPreviewName(file.name);

    try {
      const csvText = await file.text();
      const rows = parseCsv(csvText);
      if (rows.length < 2) {
        throw new Error("CSV has no data rows.");
      }

      const header = rows[0].map((h) => h.trim());
      const requiredHeader = CATEGORY_HEADERS[category];
      const headerMissing = requiredHeader.filter((h) => !header.includes(h));
      if (headerMissing.length > 0) {
        throw new Error(`Missing required columns: ${headerMissing.join(", ")}`);
      }

      const parsed: ParsedRow[] = [];

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        if (row.every((value) => value.trim() === "")) continue;

        const rowMap: Record<string, string> = {};
        for (let i = 0; i < header.length; i += 1) {
          rowMap[header[i]] = row[i] ?? "";
        }

        try {
          parsed.push({
            line: rowIndex + 1,
            sku: (rowMap.sku ?? "").trim(),
            name: (rowMap.name ?? "").trim(),
            payload: buildPayload(category, rowMap),
            error: "",
          });
        } catch (rowError) {
          const message = rowError instanceof Error ? rowError.message : "unknown error";
          parsed.push({
            line: rowIndex + 1,
            sku: (rowMap.sku ?? "").trim(),
            name: (rowMap.name ?? "").trim(),
            payload: null,
            error: message,
          });
        }
      }

      if (parsed.length === 0) {
        throw new Error("CSV has no valid data rows.");
      }
      setPreviewRows(parsed);
      const okCount = parsed.filter((row) => row.payload !== null).length;
      const ngCount = parsed.length - okCount;
      setImportSummary(`Preview ready: ${okCount} row(s) can be inserted. ${ngCount} row(s) invalid.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "failed to import csv");
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    const targets = previewRows.filter((row) => row.payload !== null);
    if (targets.length === 0) {
      setImportError("No valid rows to insert.");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportSummary("");
    try {
      let successCount = 0;
      let skippedDuplicateCount = 0;
      const failedRows: string[] = [];
      for (const row of targets) {
        try {
          const res = await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(row.payload),
          });
          if (!res.ok) {
            const body = (await res.text()) || "API error";
            if (isDuplicateSkuError(body)) {
              skippedDuplicateCount += 1;
              continue;
            }
            throw new Error(body);
          }
          successCount += 1;
        } catch (rowError) {
          const message = rowError instanceof Error ? rowError.message : "unknown error";
          failedRows.push(`line ${row.line}: ${message}`);
        }
      }

      if (successCount > 0 && onImported) {
        await onImported();
      }

      if (failedRows.length > 0) {
        setImportError(failedRows.slice(0, 10).join("\n"));
      }
      setImportSummary(
        `Imported ${successCount} item(s). Skipped duplicates ${skippedDuplicateCount} row(s). Failed ${failedRows.length} row(s).`,
      );
      setPreviewRows([]);
      setPreviewName("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "failed to insert csv");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-bold text-gray-900">CSV Template / Import</h2>
      <p className="mt-1 text-xs text-gray-600">
        Download a category template, then import filled CSV with the same columns.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => downloadTemplate("material")}
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
        >
          Download material CSV
        </button>
        <button
          type="button"
          onClick={() => downloadTemplate("part")}
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
        >
          Download part CSV
        </button>
        <button
          type="button"
          onClick={() => downloadTemplate("product")}
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
        >
          Download product CSV
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:items-end">
        <label className="text-xs font-semibold text-gray-700">
          Import Category
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setPreviewRows([]);
              setPreviewName("");
              setImportSummary("");
              setImportError("");
            }}
            disabled={importing}
          >
            <option value="material">material</option>
            <option value="part">part</option>
            <option value="product">product</option>
          </select>
        </label>

        <label className="text-xs font-semibold text-gray-700">
          CSV File
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onSelectCsvFile}
            disabled={importing}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-gray-900 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
          />
        </label>
      </div>

      {previewRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-800">
              Preview: {previewName} ({previewRows.length} rows)
            </p>
            <button
              type="button"
              onClick={confirmImport}
              disabled={importing || previewRows.every((row) => row.payload === null)}
              className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {importing ? "Inserting..." : "OK: Insert Rows"}
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <th className="p-2">Line</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 20).map((row) => (
                  <tr key={row.line} className="border-b border-gray-100">
                    <td className="p-2">{row.line}</td>
                    <td className="p-2 font-mono">{row.sku || "-"}</td>
                    <td className="p-2">{row.name || "-"}</td>
                    <td className="p-2">
                      {row.error ? (
                        <span className="text-red-700">{row.error}</span>
                      ) : (
                        <span className="text-emerald-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewRows.length > 20 && (
            <p className="mt-2 text-[11px] text-gray-500">
              Showing first 20 rows only.
            </p>
          )}
        </div>
      )}

      {importSummary && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {importSummary}
        </p>
      )}
      {importError && (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {importError}
        </pre>
      )}
    </section>
  );
}
