import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item } from "../types/item";

type AssemblyComponent = {
  component_item_id: number;
  sku: string;
  name: string;
  item_type: "component" | "assembly";
  managed_unit: Item["managed_unit"];
  qty_per_unit: number;
  note?: string;
};

type AssemblyComponentSet = {
  parent_item_id: number;
  components: AssemblyComponent[];
};

export default function AssembliesPage() {
  const [assemblies, setAssemblies] = useState<Item[]>([]);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<number | null>(null);
  const [components, setComponents] = useState<AssemblyComponent[]>([]);

  const [loadingAssemblies, setLoadingAssemblies] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [error, setError] = useState("");

  const selectedAssembly = useMemo(
    () => assemblies.find((item) => item.id === selectedAssemblyId) ?? null,
    [assemblies, selectedAssemblyId],
  );

  const loadAssemblies = useCallback(async () => {
    setLoadingAssemblies(true);
    setError("");
    try {
      const res = await fetch("/api/assemblies?limit=200");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Item[];
      setAssemblies(data);
      setSelectedAssemblyId((prev) => {
        if (prev && data.some((item) => item.id === prev)) return prev;
        return data.length > 0 ? data[0].id : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load assembly list");
      setAssemblies([]);
      setSelectedAssemblyId(null);
    } finally {
      setLoadingAssemblies(false);
    }
  }, []);

  const loadComponents = useCallback(async (assemblyId: number) => {
    setLoadingComponents(true);
    setError("");
    try {
      const res = await fetch(`/api/assemblies/${assemblyId}/components`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AssemblyComponentSet;
      setComponents(data.components);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load components");
      setComponents([]);
    } finally {
      setLoadingComponents(false);
    }
  }, []);

  useEffect(() => {
    void loadAssemblies();
  }, [loadAssemblies]);

  useEffect(() => {
    if (!selectedAssemblyId) {
      setComponents([]);
      return;
    }
    void loadComponents(selectedAssemblyId);
  }, [loadComponents, selectedAssemblyId]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-gray-900">Assembly Names</h1>
            <button
              type="button"
              onClick={() => void loadAssemblies()}
              className="rounded-full border border-gray-300 px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              Reload
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">Select an assembly to view its component BOM.</p>

          {loadingAssemblies && <p className="mt-4 text-sm text-gray-500">Loading assemblies...</p>}

          {!loadingAssemblies && assemblies.length === 0 && !error && (
            <p className="mt-4 text-sm text-gray-500">No assemblies found.</p>
          )}

          <div className="mt-4 max-h-[540px] space-y-2 overflow-auto pr-1">
            {assemblies.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedAssemblyId(item.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedAssemblyId === item.id
                    ? "border-amber-300 bg-amber-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <p className="font-mono text-xs text-gray-500">{item.sku}</p>
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-lg font-black text-gray-900">Assembly Components</h2>
            <span className="text-xs text-gray-500">
              {selectedAssembly ? `${selectedAssembly.sku} | ${selectedAssembly.name}` : "No assembly selected"}
            </span>
          </div>

          {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
          {loadingComponents && <p className="py-6 text-sm text-gray-500">Loading components...</p>}

          {!loadingComponents && !error && selectedAssembly && components.length === 0 && (
            <p className="py-6 text-sm text-gray-500">No components for this assembly.</p>
          )}

          {!loadingComponents && !error && components.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="p-3">Component ID</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Qty / Parent</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((component) => (
                    <tr key={component.component_item_id} className="border-b border-gray-100 align-top">
                      <td className="p-3 text-sm text-gray-700">{component.component_item_id}</td>
                      <td className="p-3 font-mono text-sm text-gray-900">{component.sku}</td>
                      <td className="p-3 text-sm text-gray-900">{component.name}</td>
                      <td className="p-3 text-sm text-gray-700">{component.item_type}</td>
                      <td className="p-3 text-sm text-gray-700">{component.qty_per_unit}</td>
                      <td className="p-3 text-sm text-gray-700">{component.managed_unit}</td>
                      <td className="p-3 text-sm text-gray-700">{component.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
