import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import FilterBar from "../components/FilterBar";
import NumericStepper from "../components/NumericStepper";

type ProductionComponent = {
  item_id: number;
  sku: string;
  name: string;
  managed_unit: "pcs" | "g";
  component_type: "material" | "part" | "consumable";
  pack_qty?: number;
  stock_qty: number;
  updated_at?: string;
};

export default function ProductionStockInPage() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "material" | "part" | "consumable">("all");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [resultMsg, setResultMsg] = useState("");
  const [rows, setRows] = useState<ProductionComponent[]>([]);
  const [qtyByID, setQtyByID] = useState<Record<number, string>>({});
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
    fetch(`/api/production/components${qp}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("failed to load components");
        return res.json();
      })
      .then((data: ProductionComponent[]) => {
        setRows(data);
        setQtyByID((prev) => {
          const next: Record<number, string> = {};
          for (const row of data) {
            next[row.item_id] = prev[row.item_id] ?? "0";
          }
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

  function adjustByPack(item: ProductionComponent, sign: 1 | -1) {
    const packQty = item.pack_qty ?? 0;
    if (!Number.isFinite(packQty) || packQty <= 0) return;
    setQtyByID((prev) => {
      const current = Number(prev[item.item_id] ?? "0");
      const base = Number.isFinite(current) && current > 0 ? current : 0;
      const next = Math.max(0, base + sign * packQty);
      return { ...prev, [item.item_id]: String(next) };
    });
  }

  const filteredRows = useMemo(
    () => (typeFilter === "all" ? rows : rows.filter((row) => row.component_type === typeFilter)),
    [rows, typeFilter],
  );

  const targets = filteredRows
    .map((row) => ({
      item_id: row.item_id,
      qty: parseQty(qtyByID[row.item_id] ?? "0"),
    }))
    .filter((row) => row.qty > 0);

  const totalQty = targets.reduce((sum, row) => sum + row.qty, 0);

  async function completeStockIn() {
    if (targets.length === 0) {
      setActionError("数量が 0 以外の行がありません。");
      return;
    }
    setSaving(true);
    setActionError("");
    setResultMsg("");
    try {
      const res = await fetch("/api/production/components/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: targets }),
      });
      if (!res.ok) throw new Error((await res.text()) || "failed to stock in");
      setQtyByID((prev) => {
        const next = { ...prev };
        for (const row of targets) {
          next[row.item_id] = "0";
        }
        return next;
      });
      setResultMsg(`入庫完了: ${targets.length}件`);
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
          <h1 className="text-xl font-black text-gray-900">Stock In</h1>
          <p className="mt-1 text-xs text-gray-500">
            material / part / consumable の単純入庫をまとめて実行します。
          </p>
        </div>

        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3 px-6 py-4">
          <FilterBar
            keywordValue={qInput}
            onKeywordChange={setQInput}
            keywordPlaceholder="SKU / Name"
            typeValue={typeFilter}
            onTypeChange={(value) => setTypeFilter(value as "all" | "material" | "part" | "consumable")}
            typeOptions={[
              { value: "all", label: "all" },
              { value: "material", label: "material" },
              { value: "part", label: "part" },
              { value: "consumable", label: "consumable" },
            ]}
          />
          <button
            type="submit"
            className="rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-black"
          >
            Search
          </button>
        </form>

        {fetchError && <p className="px-6 pb-4 text-sm text-red-700">{fetchError}</p>}
        {loading && <p className="px-6 pb-4 text-sm text-gray-500">Loading...</p>}

        {!loading && filteredRows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">material / part / consumable がまだありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="lg:min-w-[980px]">
              <div className="hidden grid-cols-[minmax(260px,1.4fr)_150px_minmax(360px,1fr)] items-center rounded-t-xl border border-gray-200 bg-gradient-to-r from-slate-50 to-cyan-50 text-left text-xs uppercase tracking-wider text-gray-600 lg:grid">
                <div className="p-3">SKU / Name</div>
                <div className="p-3">Stock</div>
                <div className="p-3 text-center">入庫数</div>
              </div>
              <div className="space-y-2 lg:space-y-0">
                {filteredRows.map((row) => (
                  <div
                    key={row.item_id}
                    className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/40 lg:grid lg:grid-cols-[minmax(260px,1.4fr)_150px_minmax(360px,1fr)] lg:items-center lg:gap-0 lg:rounded-none lg:border-x lg:border-b lg:border-t-0 lg:p-0 lg:shadow-none"
                  >
                    <div className="flex items-start justify-between gap-3 lg:block lg:p-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-gray-900">{row.sku}</p>
                        <p className="mt-1 text-sm font-medium text-gray-900">{row.name}</p>
                        <p className="mt-1 text-xs capitalize text-gray-500">{row.component_type}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm text-gray-700 lg:hidden">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">Stock</p>
                        <p>{row.stock_qty} {row.managed_unit}</p>
                      </div>
                    </div>
                    <div className="hidden text-sm text-gray-700 lg:block lg:p-3 lg:text-left">
                      <p>{row.stock_qty} {row.managed_unit}</p>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3 lg:mt-0 lg:border-t-0 lg:p-3 lg:pt-0">
                      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500 lg:hidden">StockIN</p>
                      <div className="flex flex-nowrap items-center gap-2">
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-2">
                          <p className="text-xs text-gray-500 text-center mb-1">
                            step {row.pack_qty ?? 0} {row.managed_unit}
                          </p>
                          <div className="flex justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => adjustByPack(row, -1)}
                              className="h-9 w-[45%] rounded-xl border-4 border-blue-300 px-3 text-xs font-bold text-gray-700 hover:bg-blue-50 disabled:opacity-50"
                              disabled={saving || !row.pack_qty || row.pack_qty <= 0}
                              title="pack -"
                            >
                              ➖
                            </button>
                            <button
                              type="button"
                              onClick={() => adjustByPack(row, 1)}
                              className="h-9 w-[45%] rounded-xl border-4 border-emerald-300 px-3 text-xs font-bold text-gray-700 hover:bg-emerald-50 disabled:opacity-50"
                              disabled={saving || !row.pack_qty || row.pack_qty <= 0}
                              title="pack +"
                            >
                              ➕
                            </button>
                          </div>
                        </div>
                        <NumericStepper
                          value={qtyByID[row.item_id] ?? "0"}
                          onChange={(next) =>
                            setQtyByID((prev) => ({ ...prev, [row.item_id]: next }))
                          }
                          min={0}
                          step={1}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
            対象: <span className="font-bold">{targets.length}</span>件 / 合計:{" "}
            <span className="font-bold">{totalQty}</span>
          </p>
          <button
            type="button"
            onClick={completeStockIn}
            disabled={saving || targets.length === 0}
            className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? "処理中..." : "入庫実行"}
          </button>
        </div>
      </div>
    </main>
  );
}
