import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { formatUtcTextToLocal } from "../utils/datetime";

type ShippingAssembly = {
  item_id: number;
  sku: string;
  name: string;
  managed_unit: "pcs" | "g";
  current_rev_no: number;
  stock_qty: number;
  updated_at?: string;
};

export default function ProductionShipmentsPage() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [resultMsg, setResultMsg] = useState("");
  const [rows, setRows] = useState<ShippingAssembly[]>([]);
  const [qtyById, setQtyById] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  function parseQty(text: string): number {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFetchError("");
    const qp = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    fetch(`/api/production/shipments/assemblies${qp}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("failed to load shipping assemblies");
        return res.json();
      })
      .then((data: ShippingAssembly[]) => {
        setRows(data);
        setQtyById((prev) => {
          const next: Record<number, string> = {};
          for (const item of data) next[item.item_id] = prev[item.item_id] ?? "0";
          return next;
        });
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setFetchError(e instanceof Error ? e.message : "API error");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [q]);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQ(qInput);
  }

  function adjustQty(itemID: number, delta: number) {
    setQtyById((prev) => {
      const current = Number(prev[itemID] ?? "0");
      const base = Number.isFinite(current) && current > 0 ? current : 0;
      const next = Math.max(0, base + delta);
      return { ...prev, [itemID]: String(next) };
    });
  }

  const targets = rows
    .map((item) => ({
      item_id: item.item_id,
      sku: item.sku,
      qty: parseQty(qtyById[item.item_id] ?? "0"),
    }))
    .filter((row) => row.qty > 0);

  async function completeShipmentBatch() {
    if (targets.length === 0) {
      setActionError("数量が 0 以外の行がありません。");
      return;
    }
    setSaving(true);
    setActionError("");
    setResultMsg("");
    try {
      const res = await fetch("/api/production/shipments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipments: targets.map((t) => ({ item_id: t.item_id, qty: t.qty })) }),
      });
      if (!res.ok) throw new Error((await res.text()) || "failed to complete shipments");
      setQtyById((prev) => {
        const next = { ...prev };
        for (const row of targets) next[row.item_id] = "0";
        return next;
      });
      setResultMsg(`出荷完了: ${targets.length}件`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "API error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 pb-28 md:px-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <h1 className="text-xl font-black text-gray-900">Shipping</h1>
          <p className="mt-1 text-xs text-gray-500">
            assembly をまとめて出荷し、BOM通りに在庫を減算します。
          </p>
        </div>

        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3 px-6 py-4">
          <label className="min-w-[260px] flex-1 text-xs font-semibold text-gray-700">
            Keyword
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="SKU / Name"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-black"
          >
            Search
          </button>
        </form>

        {fetchError && <p className="px-6 pb-4 text-sm text-red-700">{fetchError}</p>}
        {loading && <p className="px-6 pb-4 text-sm text-gray-500">Loading...</p>}

        {!loading && rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">出荷対象の assembly はまだありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-xs uppercase tracking-wider text-gray-600">
                  <th className="p-3">SKU</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Rev</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3">出荷数</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.item_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono text-sm text-gray-900">{item.sku}</td>
                    <td className="p-3 text-sm text-gray-900">{item.name}</td>
                    <td className="p-3 text-sm text-gray-700">r{item.current_rev_no}</td>
                    <td className="p-3 text-sm text-gray-700">{item.stock_qty} {item.managed_unit}</td>
                    <td className="p-3 text-sm text-gray-700">{formatUtcTextToLocal(item.updated_at)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustQty(item.item_id, -1)}
                          className="h-11 w-11 rounded-full border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-100"
                          disabled={saving}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={qtyById[item.item_id] ?? "0"}
                          onChange={(e) =>
                            setQtyById((prev) => ({ ...prev, [item.item_id]: e.target.value }))
                          }
                          className="h-10 w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          disabled={saving}
                        />
                        <button
                          type="button"
                          onClick={() => adjustQty(item.item_id, 1)}
                          className="h-11 w-11 rounded-full border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-100"
                          disabled={saving}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resultMsg && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resultMsg}</p>
      )}
      {actionError && (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </pre>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <p className="text-sm text-gray-700">
            対象: <span className="font-bold">{targets.length}</span>件
          </p>
          <button
            type="button"
            onClick={completeShipmentBatch}
            disabled={saving || targets.length === 0}
            className="rounded-full bg-rose-700 px-5 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {saving ? "処理中..." : "出荷実行"}
          </button>
        </div>
      </div>
    </main>
  );
}

