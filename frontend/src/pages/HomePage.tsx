import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  component_type?: "part" | "material";
  managed_unit: "pcs" | "g";
  stock_managed: boolean;
  stock_qty: number;
  updated_at?: string;
};

export default function HomePage({ items }: HomePageProps) {
  const [stockRows, setStockRows] = useState<StockSummaryRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [stockTypeFilter, setStockTypeFilter] = useState<
    "all" | "assembly" | "component_material" | "component_part"
  >("all");

  const counts = useMemo(() => {
    const base = { component: 0, assembly: 0, sellable: 0, final: 0 };
    for (const item of items) {
      base[item.item_type] += 1;
      if (item.is_sellable) base.sellable += 1;
      if (item.is_final) base.final += 1;
    }
    return base;
  }, [items]);

  const cards = [
    { label: "Total Items", value: items.length },
    { label: "Components", value: counts.component },
    { label: "Assemblies", value: counts.assembly },
    { label: "Sellable", value: counts.sellable },
    { label: "Final", value: counts.final },
  ];

  const filteredStockRows = useMemo(() => {
    switch (stockTypeFilter) {
      case "assembly":
        return stockRows.filter((row) => row.item_type === "assembly");
      case "component_material":
        return stockRows.filter(
          (row) => row.item_type === "component" && (row.component_type ?? "material") === "material",
        );
      case "component_part":
        return stockRows.filter(
          (row) => row.item_type === "component" && row.component_type === "part",
        );
      default:
        return stockRows;
    }
  }, [stockRows, stockTypeFilter]);

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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <div className="rounded-3xl bg-gradient-to-br from-cyan-300 via-blue-300 to-gray-300 p-8 shadow-2xl">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-5xl">
          Inventory Home
        </h1>
        <p className="mt-3 max-w-2xl text-gray-800">
          Track items, register new SKUs, and keep your stock definitions clean.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/items/new"
            className="rounded-full bg-gray-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-black"
          >
            Create Item
          </Link>
          <Link
            to="/items"
            className="rounded-full bg-white/80 px-5 py-3 text-sm font-bold text-gray-900 transition hover:bg-white"
          >
            Open Item List
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-5">
        {cards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-black text-gray-900">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Stock List</h2>
              <p className="mt-1 text-xs text-gray-500">管理対象（stock managed = true）のみ表示</p>
            </div>
            <label className="text-xs font-semibold text-gray-700">
              Type
              <select
                className="mt-1 w-52 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                value={stockTypeFilter}
                onChange={(e) =>
                  setStockTypeFilter(
                    e.target.value as "all" | "assembly" | "component_material" | "component_part",
                  )
                }
              >
                <option value="all">all</option>
                <option value="assembly">assembly</option>
                <option value="component_material">component(material)</option>
                <option value="component_part">component(part)</option>
              </select>
            </label>
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
                  <th className="p-3">Unit</th>
                  <th className="p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockRows.map((row) => (
                  <tr key={row.item_id} className="border-b border-gray-100">
                    <td className="p-3 font-mono text-sm text-gray-900">{row.sku}</td>
                    <td className="p-3 text-sm text-gray-900">{row.name}</td>
                    <td className="p-3 text-sm text-gray-700">
                      {row.item_type === "component"
                        ? `component(${row.component_type || "material"})`
                        : "assembly"}
                    </td>
                    <td className="p-3 text-sm text-gray-900">{row.stock_qty}</td>
                    <td className="p-3 text-sm text-gray-700">{row.managed_unit}</td>
                    <td className="p-3 text-sm text-gray-700">{formatUtcTextToLocal(row.updated_at)}</td>
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
