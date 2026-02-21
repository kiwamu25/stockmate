import { useState } from "react";
import type { Item } from "../types/item";

type ItemType = Item["item_type"];
type ManagedUnit = Item["managed_unit"];
type CsvEncoding = "utf-8" | "shift_jis";

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

const TYPE_REQUIRED_HEADERS: Record<ItemType, string[]> = {
  component: [
    "sku",
    "name",
    "managed_unit",
    "pack_qty",
    "reorder_point",
    "stock_managed",
    "is_sellable",
    "is_final",
    "note",
    "component_manufacturer",
    "component_type",
    "component_color",
  ],
  assembly: [
    "sku",
    "name",
    "managed_unit",
    "pack_qty",
    "reorder_point",
    "stock_managed",
    "is_sellable",
    "is_final",
    "note",
    "assembly_manufacturer",
    "assembly_total_weight",
    "assembly_pack_size",
    "assembly_note",
  ],
};

const TYPE_TEMPLATE_HEADERS: Record<ItemType, string[]> = {
  component: [
    ...TYPE_REQUIRED_HEADERS.component,
    "link_name-1",
    "link_url-1",
    "link_name-2",
    "link_url-2",
    "link_name-3",
    "link_url-3",
  ],
  assembly: TYPE_REQUIRED_HEADERS.assembly,
};

const TEMPLATE_ROWS: Record<ItemType, string[][]> = {
  component: [
    [
      "PRT-001",
      "M3 Nut",
      "pcs",
      "100",
      "20",
      "true",
      "false",
      "false",
      "",
      "Generic",
      "part",
      "",
      "Amazon",
      "https://example.com/items/m3-nut",
      "MonotaRO",
      "https://shop.example.net/products/m3-nut",
      "Rakuten",
      "https://store.example.org/m3-nut",
    ],
    [
      "CON-001",
      "Nozzle Cleaner",
      "pcs",
      "30",
      "5",
      "true",
      "false",
      "false",
      "",
      "Generic",
      "consumable",
      "",
      "Bambu Store",
      "https://example.com/items/nozzle-cleaner",
      "Amazon",
      "https://shop.example.net/products/nozzle-cleaner",
      "",
      "",
    ],
  ],
  assembly: [
    [
      "ASM-001",
      "Phone Stand",
      "pcs",
      "10",
      "3",
      "true",
      "true",
      "true",
      "",
      "In-house",
      "120",
      "10x8x12",
      "",
    ],
  ],
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

function parseOptionalNonNegativeNumber(text: string, field: string, emptyValue: number): number {
  const trimmed = text.trim();
  if (trimmed === "") return emptyValue;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} must be zero or a positive number.`);
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

function parseBoolean(text: string, field: string, defaultValue: boolean): boolean {
  const value = text.trim().toLowerCase();
  if (value === "") return defaultValue;
  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;
  throw new Error(`${field} must be true/false (or 1/0).`);
}

function parseComponentType(text: string): "material" | "part" | "consumable" {
  const value = text.trim().toLowerCase();
  if (value === "") return "material";
  if (value === "material" || value === "part" || value === "consumable") {
    return value;
  }
  throw new Error("component_type must be material, part, or consumable.");
}

function collectPurchaseLinks(rowMap: Record<string, string>): Array<{ url: string }> {
  const out: Array<{ url: string; label?: string }> = [];
  for (let i = 1; i <= 3; i += 1) {
    const url = (rowMap[`link_url-${i}`] ?? rowMap[`purchase_url_${i}`] ?? "").trim();
    if (url === "") continue;
    const label = (rowMap[`link_name-${i}`] ?? "").trim();
    out.push({ url, label: label || undefined });
  }
  return out;
}

function decodeCsv(bytes: Uint8Array, encoding: CsvEncoding): string {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    const label = encoding === "utf-8" ? "UTF-8" : "SJIS";
    throw new Error(`Failed to decode CSV as ${label}. Try another encoding.`);
  }
}

function buildPayload(itemType: ItemType, rowMap: Record<string, string>): Record<string, unknown> {
  const sku = (rowMap.sku ?? "").trim();
  const name = (rowMap.name ?? "").trim();
  if (!sku || !name) {
    throw new Error("sku and name are required.");
  }

  const payload: Record<string, unknown> = {
    sku,
    name,
    item_type: itemType,
    managed_unit: parseManagedUnit(rowMap.managed_unit ?? ""),
    pack_qty: parseOptionalPositiveNumber(rowMap.pack_qty ?? "", "pack_qty"),
    reorder_point: parseOptionalNonNegativeNumber(
      rowMap.reorder_point ?? "",
      "reorder_point",
      0,
    ),
    stock_managed: parseBoolean(rowMap.stock_managed ?? "", "stock_managed", true),
    is_sellable: parseBoolean(rowMap.is_sellable ?? "", "is_sellable", false),
    is_final: parseBoolean(rowMap.is_final ?? "", "is_final", false),
    note: (rowMap.note ?? "").trim(),
  };

  if (itemType === "assembly") {
    payload.assembly = {
      manufacturer: (rowMap.assembly_manufacturer ?? "").trim(),
      total_weight: parseOptionalPositiveNumber(
        rowMap.assembly_total_weight ?? "",
        "assembly_total_weight",
      ),
      pack_size: (rowMap.assembly_pack_size ?? "").trim(),
      note: (rowMap.assembly_note ?? "").trim(),
    };
  } else {
    const purchaseLinks = collectPurchaseLinks(rowMap);
    payload.component = {
      manufacturer: (rowMap.component_manufacturer ?? "").trim(),
      component_type: parseComponentType(rowMap.component_type ?? ""),
      color: (rowMap.component_color ?? "").trim(),
      purchase_links: purchaseLinks,
    };
  }

  return payload;
}

export default function ItemCsvTools({ onImported }: ItemCsvToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [itemType, setItemType] = useState<ItemType>("assembly");
  const [encoding, setEncoding] = useState<CsvEncoding>("utf-8");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);

  function buildPreview(bytes: Uint8Array, nextItemType: ItemType, nextEncoding: CsvEncoding) {
    const csvText = decodeCsv(bytes, nextEncoding);
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      throw new Error("CSV has no data rows.");
    }

    const header = rows[0].map((h) => h.trim());
    const requiredHeader = TYPE_REQUIRED_HEADERS[nextItemType];
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
          payload: buildPayload(nextItemType, rowMap),
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
    return parsed;
  }

  function downloadTemplate(targetType: ItemType) {
    const header = TYPE_TEMPLATE_HEADERS[targetType];
    const sampleRows = TEMPLATE_ROWS[targetType];
    const body = sampleRows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const content = `${header.map(csvEscape).join(",")}\n${body}\n`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `item-template-${targetType}.csv`;
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
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = buildPreview(bytes, itemType, encoding);
      setSourceBytes(bytes);
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
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span className="text-sm font-bold text-gray-900">CSV Template / Import</span>
        <span className="text-xs font-semibold text-gray-600">{isOpen ? "Hide" : "Show"}</span>
      </button>

      {isOpen && (
        <>
          <p className="mt-1 text-xs text-gray-600">
            Download an item type template, then import filled CSV with the same columns.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => downloadTemplate("assembly")}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
            >
              Download <span className="text-red-500 text-lg">Assembly</span> CSV
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate("component")}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
            >
              Download <span className="text-blue-500 text-lg">Component</span> CSV
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[180px_160px_minmax(0,1fr)] md:items-end">
            <label className="text-xs font-semibold text-gray-700">
              Import Item Type
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                value={itemType}
                onChange={(e) => {
                  setItemType(e.target.value as ItemType);
                  setPreviewRows([]);
                  setPreviewName("");
                  setSourceBytes(null);
                  setImportSummary("");
                  setImportError("");
                }}
                disabled={importing}
              >
                <option value="component">component</option>
                <option value="assembly">assembly</option>
              </select>
            </label>

            <label className="text-xs font-semibold text-gray-700">
              CSV Encoding <br/>(Excel uses Shift-JIS)
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                value={encoding}
                onChange={(e) => {
                  const nextEncoding = e.target.value as CsvEncoding;
                  setEncoding(nextEncoding);
                  setImportSummary("");
                  setImportError("");
                  if (!sourceBytes) return;
                  try {
                    const parsed = buildPreview(sourceBytes, itemType, nextEncoding);
                    setPreviewRows(parsed);
                    const okCount = parsed.filter((row) => row.payload !== null).length;
                    const ngCount = parsed.length - okCount;
                    setImportSummary(
                      `Preview ready: ${okCount} row(s) can be inserted. ${ngCount} row(s) invalid.`,
                    );
                  } catch (error) {
                    setPreviewRows([]);
                    setImportError(error instanceof Error ? error.message : "failed to decode csv");
                  }
                }}
                disabled={importing}
              >
                <option value="utf-8">UTF-8</option>
                <option value="shift_jis">SJIS</option>
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
        </>
      )}
    </section>
  );
}
