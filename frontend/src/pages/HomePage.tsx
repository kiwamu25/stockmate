import { useEffect, useMemo, useState } from "react";
import FilterBar from "../components/FilterBar";
import type { Item } from "../types/item";
import { formatUtcTextToLocal } from "../utils/datetime";

type HomePageProps = {
  items: Item[];
};

type StockSummaryRow = {
  item_id: number;
  sku: string;
  name: string;
  item_type: "component" | "assembly";
  component_type?: "part" | "material" | "consumable";
  purchase_url?: string;
  managed_unit: "pcs" | "g";
  stock_managed: boolean;
  stock_qty: number;
  updated_at?: string;
};

type StockSummaryWithReorder = StockSummaryRow & {
  reorder_point: number;
  reorder_gap: number;
  purchase_links: Array<{
    id?: number;
    url: string;
    label?: string;
    enabled: boolean;
  }>;
};

export default function HomePage({ items }: HomePageProps) {
  const [stockRows, setStockRows] = useState<StockSummaryRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [openLinksItemID, setOpenLinksItemID] = useState<number | null>(null);
  const [stockKeyword, setStockKeyword] = useState("");
  const [stockTypeFilter, setStockTypeFilter] = useState<
    "all" | "assembly" | "component_material" | "component_part" | "component_consumable"
  >("all");

  const filteredStockRows = useMemo<StockSummaryWithReorder[]>(() => {
    const reorderPointMap = new Map(items.map((item) => [item.id, item.reorder_point ?? 0]));
    const purchaseLinksMap = new Map(
      items.map((item) => [
        item.id,
        (item.component?.purchase_links ?? []).filter(
          (link) => link.enabled && link.url.trim() !== "",
        ),
      ]),
    );

    const rowsWithReorder = stockRows
      .map((row) => {
        const reorderPoint = reorderPointMap.get(row.item_id) ?? 0;
        return {
          ...row,
          reorder_point: reorderPoint,
          reorder_gap: row.stock_qty - reorderPoint,
          purchase_links: purchaseLinksMap.get(row.item_id) ?? [],
        };
      });

    const typedRows = rowsWithReorder.filter((row) => {
      switch (stockTypeFilter) {
        case "assembly":
          return row.item_type === "assembly";
        case "component_material":
          return row.item_type === "component" && (row.component_type ?? "material") === "material";
        case "component_part":
          return row.item_type === "component" && row.component_type === "part";
        case "component_consumable":
          return row.item_type === "component" && row.component_type === "consumable";
        default:
          return true;
      }
    });

    const q = stockKeyword.trim().toLowerCase();
    const keywordRows = q
      ? typedRows.filter(
          (row) => row.sku.toLowerCase().includes(q) || row.name.toLowerCase().includes(q),
        )
      : typedRows;

    return keywordRows.sort((a, b) => {
      const aIsZero = a.reorder_point === 0;
      const bIsZero = b.reorder_point === 0;
      if (aIsZero !== bIsZero) return aIsZero ? 1 : -1;
      if (a.reorder_gap !== b.reorder_gap) return a.reorder_gap - b.reorder_gap;
      if (a.stock_qty !== b.stock_qty) return a.stock_qty - b.stock_qty;
      return a.item_id - b.item_id;
    });
  }, [items, stockKeyword, stockRows, stockTypeFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setStockLoading(true);
    setStockError("");
    fetch("/api/stock/summary?managed=1&limit=200", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("failed to load stock summary");
        return res.json();
      })
      .then((data: StockSummaryRow[]) => setStockRows(data))
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setStockError(e instanceof Error ? e.message : "API error");
      })
      .finally(() => setStockLoading(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-links-dropdown]")) return;
      setOpenLinksItemID(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Stock List</h2>
              <p className="mt-1 text-xs text-gray-500">管理対象（stock managed = true）のみ表示</p>
            </div>
            <FilterBar
              keywordValue={stockKeyword}
              onKeywordChange={setStockKeyword}
              keywordPlaceholder="sku / name"
              typeValue={stockTypeFilter}
              onTypeChange={(value) =>
                setStockTypeFilter(
                  value as
                    | "all"
                    | "assembly"
                    | "component_material"
                    | "component_part"
                    | "component_consumable",
                )
              }
              typeOptions={[
                { value: "all", label: "all" },
                { value: "assembly", label: "assembly" },
                { value: "component_material", label: "material" },
                { value: "component_part", label: "part" },
                { value: "component_consumable", label: "consumable" },
              ]}
            />
          </div>
        </div>

        {stockError && (
          <p className="px-6 py-4 text-sm text-red-700">{stockError}</p>
        )}
        {!stockError && stockLoading && (
          <p className="px-6 py-4 text-sm text-gray-500">Loading...</p>
        )}
        {!stockError && !stockLoading && filteredStockRows.length === 0 && (
          <p className="px-6 py-4 text-sm text-gray-500">表示できる在庫データがありません。</p>
        )}

        {!stockError && !stockLoading && filteredStockRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-xs uppercase tracking-wider text-gray-600">
                  <th className="p-3">SKU</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Reorder Point</th>
                  <th className="p-3">Link</th>
                  <th className="p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockRows.map((row) => (
                  <tr
                    key={row.item_id}
                    className={`border-b border-gray-100 ${
                      row.reorder_gap < 0 ? "bg-red-300 text-gray-900" : "text-gray-900"
                    }`}
                  >
                    <td className="p-3 font-mono text-sm">{row.sku}</td>
                    <td className="p-3 text-sm">{row.name}</td>
                    <td className="p-3 text-sm">
                      {row.item_type === "component" ? (row.component_type || "material") : "assembly"}
                    </td>
                    <td className="p-3 text-sm">
                      {row.stock_qty} {row.managed_unit}
                    </td>
                    <td className="p-3 text-sm">
                      {row.reorder_point} {row.managed_unit}
                    </td>
                    <td className="p-3 text-sm">
                      {row.purchase_links.length > 0 ? (
                        <div className="relative inline-block" data-links-dropdown>
                          <button
                            type="button"
                            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            onClick={() =>
                              setOpenLinksItemID((prev) => (prev === row.item_id ? null : row.item_id))
                            }
                          >
                            Links ({row.purchase_links.length})
                          </button>
                          {openLinksItemID === row.item_id && (
                            <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                              <div className="max-h-56 overflow-auto">
                                {row.purchase_links.map((link, idx) => (
                                  <a
                                    key={link.id ?? `${row.item_id}-${idx}-${link.url}`}
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 hover:underline"
                                    title={link.url}
                                  >
                                    {link.label?.trim() ? link.label : link.url}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3 text-sm">{formatUtcTextToLocal(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
