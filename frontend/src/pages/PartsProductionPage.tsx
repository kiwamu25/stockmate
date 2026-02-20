import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import NumericStepper from "../components/NumericStepper";
import { formatUtcTextToLocal } from "../utils/datetime";

type ProductionPart = {
  item_id: number;
  sku: string;
  name: string;
  managed_unit: "pcs" | "g";
  current_rev_no: number;
  stock_qty: number;
  updated_at?: string;
};

type ConsumptionRow = {
  item_id: number;
  sku: string;
  name: string;
  item_type: string;
  component_type?: string;
  managed_unit: "pcs" | "g";
  qty: number;
};

export default function PartsProductionPage() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [parts, setParts] = useState<ProductionPart[]>([]);
  const [qtyById, setQtyById] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [consumptions, setConsumptions] = useState<ConsumptionRow[]>([]);

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
    fetch(`/api/production/parts${qp}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("failed to load parts production list");
        return res.json();
      })
      .then((data: ProductionPart[]) => {
        setParts(data);
        setQtyById((prev) => {
          const next: Record<number, string> = {};
          for (const item of data) {
            next[item.item_id] = prev[item.item_id] ?? "0";
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

  const targets = parts
    .map((item) => ({
      itemID: item.item_id,
      sku: item.sku,
      qty: parseQty(qtyById[item.item_id] ?? "0"),
    }))
    .filter((row) => row.qty > 0);

  const totalQty = targets.reduce((sum, row) => sum + row.qty, 0);
  async function completeProductionBatch() {
    if (targets.length === 0) {
      setActionError("数量が 0 以外の行がありません。");
      return;
    }
    setSaving(true);
    setActionError("");
    setResultMsg("");
    setConsumptions([]);

    try {
      let successCount = 0;
      const failed: string[] = [];
      const consumedByID: Record<number, ConsumptionRow> = {};

      for (const row of targets) {
        try {
          const res = await fetch(`/api/production/parts/${row.itemID}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qty: row.qty }),
          });
          if (!res.ok) {
            throw new Error((await res.text()) || "failed");
          }
          const body = (await res.json()) as { consumptions?: ConsumptionRow[] };
          for (const c of body.consumptions ?? []) {
            const prev = consumedByID[c.item_id];
            if (!prev) {
              consumedByID[c.item_id] = { ...c };
              continue;
            }
            prev.qty += c.qty;
          }
          successCount += 1;
        } catch (e) {
          failed.push(`${row.sku}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      if (successCount > 0) {
        setQtyById((prev) => {
          const next = { ...prev };
          for (const row of targets) {
            next[row.itemID] = "0";
          }
          return next;
        });
      }

      if (failed.length > 0) {
        setActionError(failed.slice(0, 5).join("\n"));
      }
      setConsumptions(Object.values(consumedByID).sort((a, b) => a.sku.localeCompare(b.sku)));
      setResultMsg(`処理完了: ${successCount}件 成功 / ${failed.length}件 失敗`);
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
          <h1 className="text-xl font-black text-gray-900">Parts Production</h1>
          <p className="mt-1 text-xs text-gray-500">
            builder 登録済みの component(part) を表示しています。
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

        {fetchError && (
          <p className="px-6 pb-4 text-sm text-red-700">{fetchError}</p>
        )}

        {loading && (
          <p className="px-6 pb-4 text-sm text-gray-500">Loading...</p>
        )}

        {!loading && parts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">
            builder 登録済みの component(part) はまだありません。
          </p>
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
                  <th className="p-3">入庫数</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((item) => (
                  <tr key={item.item_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono text-sm text-gray-900">{item.sku}</td>
                    <td className="p-3 text-sm text-gray-900">{item.name}</td>
                    <td className="p-3 text-sm text-gray-700">r{item.current_rev_no}</td>
                    <td className="p-3 text-sm text-gray-700">
                      {item.stock_qty} {item.managed_unit}
                    </td>
                    <td className="p-3 text-sm text-gray-700">{formatUtcTextToLocal(item.updated_at)}</td>
                    <td className="p-3">
                      <NumericStepper
                        value={qtyById[item.item_id] ?? "0"}
                        onChange={(next) =>
                          setQtyById((prev) => ({ ...prev, [item.item_id]: next }))
                        }
                        min={0}
                        step={1}
                        disabled={saving}
                      />
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
      {consumptions.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
          <div className="border-b border-amber-200 px-4 py-3">
            <h2 className="text-sm font-bold text-amber-900">使用した material / parts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-amber-100 text-left text-xs uppercase tracking-wider text-amber-800">
                  <th className="p-2">SKU</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Used</th>
                </tr>
              </thead>
              <tbody>
                {consumptions.map((row) => (
                  <tr key={row.item_id} className="border-b border-amber-100">
                    <td className="p-2 font-mono text-gray-900">{row.sku}</td>
                    <td className="p-2 text-gray-900">{row.name}</td>
                    <td className="p-2 text-gray-700">
                      {row.item_type === "component"
                        ? `component(${row.component_type || "material"})`
                        : row.item_type}
                    </td>
                    <td className="p-2 font-semibold text-rose-700">
                      -{row.qty} {row.managed_unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <p className="text-sm text-gray-700">
            対象: <span className="font-bold">{targets.length}</span>件 / 合計:{" "}
            <span className="font-bold">{totalQty}</span>
          </p>
          <button
            type="button"
            onClick={completeProductionBatch}
            disabled={saving || targets.length === 0}
            className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? "処理中..." : "生産完了（在庫追加）"}
          </button>
        </div>
      </div>
    </main>
  );
}
