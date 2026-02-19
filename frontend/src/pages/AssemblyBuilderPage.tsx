import { useMemo, useState } from "react";
import type { Item } from "../types/item";

type AssemblyBuilderPageProps = {
  items: Item[];
};

type ComponentLine = {
  id: string;
  itemId: number;
  qty: string;
  unit: Item["managed_unit"];
  note: string;
};

function lineId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AssemblyBuilderPage({ items }: AssemblyBuilderPageProps) {
  const assemblyItems = useMemo(
    () => items.filter((item) => item.item_type === "assembly"),
    [items],
  );
  const sourceItems = useMemo(
    () => items.filter((item) => item.item_type === "material" || item.item_type === "assembly"),
    [items],
  );

  const [outputAssemblyId, setOutputAssemblyId] = useState<number | "">("");
  const [lines, setLines] = useState<ComponentLine[]>([]);
  const [lineError, setLineError] = useState("");

  const selectedOutput = useMemo(
    () => assemblyItems.find((item) => item.id === outputAssemblyId) ?? null,
    [assemblyItems, outputAssemblyId],
  );

  const availableInputs = useMemo(
    () => sourceItems.filter((item) => item.id !== outputAssemblyId),
    [sourceItems, outputAssemblyId],
  );

  const completion = useMemo(() => {
    const parsed = lines.map((line) => ({
      ...line,
      qtyNum: Number(line.qty),
    }));
    const invalid = parsed.some((line) => !Number.isFinite(line.qtyNum) || line.qtyNum <= 0);
    const total = parsed.reduce((sum, line) => sum + (Number.isFinite(line.qtyNum) ? line.qtyNum : 0), 0);
    return {
      invalid,
      total,
      ready: !!selectedOutput && lines.length > 0 && !invalid,
    };
  }, [lines, selectedOutput]);

  function addLine(item: Item) {
    setLineError("");
    setLines((prev) => [
      ...prev,
      {
        id: lineId(),
        itemId: item.id,
        qty: "1",
        unit: item.managed_unit,
        note: "",
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((line) => line.id !== id));
  }

  function updateLine(id: string, patch: Partial<ComponentLine>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function clearAll() {
    setOutputAssemblyId("");
    setLines([]);
    setLineError("");
  }

  function copyRecipeJson() {
    if (!completion.ready || !selectedOutput) {
      setLineError("Output assembly and valid component quantities are required.");
      return;
    }

    const payload = {
      process_type: "assembly",
      output_item_id: selectedOutput.id,
      output_sku: selectedOutput.sku,
      output_name: selectedOutput.name,
      inputs: lines.map((line) => {
        const item = sourceItems.find((source) => source.id === line.itemId);
        return {
          item_id: line.itemId,
          sku: item?.sku ?? "",
          name: item?.name ?? "",
          qty: Number(line.qty),
          unit: line.unit,
          note: line.note.trim(),
        };
      }),
    };

    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => setLineError(""))
      .catch(() => setLineError("Failed to copy. Please allow clipboard access."));
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-black tracking-tight text-gray-900 md:text-4xl">
          Assembly Builder
        </h1>
        <p className="mt-2 text-sm text-gray-700 md:text-base">
          Connect items into one assembly definition and generate a recipe draft JSON.
        </p>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">1. Output Assembly</h2>
          <select
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={outputAssemblyId}
            onChange={(e) => setOutputAssemblyId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Select output assembly</option>
            {assemblyItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} | {item.name}
              </option>
            ))}
          </select>
          {selectedOutput ? (
            <p className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
              Output: {selectedOutput.sku} ({selectedOutput.name})
            </p>
          ) : (
            <p className="mt-3 text-xs text-gray-500">Pick one assembly item as your output.</p>
          )}

          <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-gray-700">2. Add Components</h2>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
            {availableInputs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addLine(item)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50"
              >
                <span>
                  <span className="block font-mono text-xs text-gray-500">{item.sku}</span>
                  <span className="block text-sm font-semibold text-gray-900">{item.name}</span>
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] uppercase text-gray-600">
                  {item.item_type}
                </span>
              </button>
            ))}
            {availableInputs.length === 0 && (
              <p className="text-sm text-gray-500">No source items available.</p>
            )}
          </div>
        </aside>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
            <h2 className="text-lg font-black text-gray-900">3. Connection Flow</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="rounded-full border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={copyRecipeJson}
                className="rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-black"
              >
                Copy Recipe JSON
              </button>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Add components from the left pane to start building this assembly.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {lines.map((line, idx) => {
                const source = sourceItems.find((item) => item.id === line.itemId);
                return (
                  <div key={line.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Link {idx + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-xs font-bold text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500">{source?.sku}</p>
                    <p className="text-sm font-bold text-gray-900">{source?.name ?? "Unknown Item"}</p>

                    <div className="mt-3 grid gap-3 md:grid-cols-[140px_120px_minmax(0,1fr)]">
                      <label className="text-xs font-semibold text-gray-700">
                        Qty
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={line.qty}
                          onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                        />
                      </label>
                      <label className="text-xs font-semibold text-gray-700">
                        Unit
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={line.unit}
                          onChange={(e) => updateLine(line.id, { unit: e.target.value as Item["managed_unit"] })}
                        >
                          <option value="pcs">pcs</option>
                          <option value="g">g</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-gray-700">
                        Note
                        <input
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={line.note}
                          onChange={(e) => updateLine(line.id, { note: e.target.value })}
                          placeholder="optional process memo"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-700">Draft status</p>
            <p className="mt-1 text-sm font-semibold text-amber-900">
              {selectedOutput ? `Output: ${selectedOutput.sku}` : "Output not selected"}
            </p>
            <p className="text-sm text-amber-900">Links: {lines.length}</p>
            <p className="text-sm text-amber-900">Total Qty: {completion.total.toFixed(2)}</p>
            {!completion.ready && (
              <p className="mt-1 text-xs text-amber-700">
                Select output assembly and enter positive qty for each line.
              </p>
            )}
          </div>

          {lineError && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{lineError}</div>
          )}
        </div>
      </section>
    </main>
  );
}
