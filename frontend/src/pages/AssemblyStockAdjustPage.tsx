import { useCallback, useEffect, useMemo, useState } from "react";

type AssemblyStock = {
  item_id: number;
  sku: string;
  name: string;
  stock_qty: number;
  updated_at?: string;
};

type FormState = {
  qty: string;
  note: string;
};

export default function AssemblyStockAdjustPage() {
  const [assemblies, setAssemblies] = useState<AssemblyStock[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>({ qty: "1", note: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => assemblies.find((row) => row.item_id === selectedId) ?? null,
    [assemblies, selectedId],
  );

  const loadAssemblies = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/assemblies/stock?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AssemblyStock[];
      setAssemblies(data);
      setSelectedId((prev) => {
        if (prev && data.some((row) => row.item_id === prev)) return prev;
        return data.length > 0 ? data[0].item_id : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load assemblies");
      setAssemblies([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssemblies("");
  }, [loadAssemblies]);

  async function submitAdjust(direction: "IN" | "OUT") {
    if (!selected) {
      setError("Select an assembly.");
      return;
    }
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Qty must be a positive number.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/assemblies/${selected.item_id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          qty,
          note: form.note.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { item_id: number; stock_qty: number };
      setAssemblies((prev) =>
        prev.map((row) =>
          row.item_id === data.item_id ? { ...row, stock_qty: data.stock_qty } : row,
        ),
      );
      setMessage(`${direction === "IN" ? "入庫" : "出庫"}を登録しました。`);
      setForm((prev) => ({ ...prev, note: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to adjust stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-black text-gray-900">Assembly Adjust</h1>
          <p className="mt-1 text-xs text-gray-500">Adjust stock by IN / OUT.</p>

          <div className="mt-4 flex gap-2">
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Search SKU / Name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void loadAssemblies(search)}
              className="rounded-full border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              Search
            </button>
          </div>

          {loading && <p className="mt-4 text-sm text-gray-500">Loading...</p>}

          <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
            {assemblies.map((row) => (
              <button
                key={row.item_id}
                type="button"
                onClick={() => setSelectedId(row.item_id)}
                className={`w-full rounded-xl border px-3 py-2 text-left ${
                  selectedId === row.item_id
                    ? "border-amber-300 bg-amber-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <p className="font-mono text-xs text-gray-500">{row.sku}</p>
                <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                <p className="text-xs text-gray-600">Stock: {row.stock_qty}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-900">Adjust Panel</h2>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="font-mono text-xs text-gray-500">{selected.sku}</p>
                <p className="text-sm font-semibold text-gray-900">{selected.name}</p>
                <p className="mt-1 text-sm text-gray-700">Current Stock: {selected.stock_qty}</p>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Qty
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2"
                  value={form.qty}
                  onChange={(e) => setForm((prev) => ({ ...prev, qty: e.target.value }))}
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Note
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="optional"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submitAdjust("IN")}
                  className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {saving ? "Saving..." : "入庫"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submitAdjust("OUT")}
                  className="rounded-full bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
                >
                  {saving ? "Saving..." : "出庫"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Select assembly from left list.</p>
          )}

          {message && (
            <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              {message}
            </div>
          )}
          {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        </section>
      </div>
    </main>
  );
}
