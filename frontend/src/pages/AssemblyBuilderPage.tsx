import { useEffect, useMemo, useState } from "react";
import type { Item } from "../types/item";

type AssemblyBuilderPageProps = {
  items: Item[];
};

type SelectedComponent = {
  itemId: number;
  sku: string;
  name: string;
  itemType: Item["item_type"];
  unit: Item["managed_unit"];
  qtyPerUnit: string;
  note: string;
};

type AssemblyRevision = {
  record_id: number;
  rev_no: number;
  created_at: string;
  component_count: number;
};

type AssemblyComponentSet = {
  parent_item_id: number;
  current_record_id?: number;
  current_rev_no?: number;
  current_created_at?: string;
  revisions: AssemblyRevision[];
  components: Array<{
    component_item_id: number;
    sku: string;
    name: string;
    item_type: Item["item_type"];
    managed_unit: Item["managed_unit"];
    qty_per_unit: number;
    note?: string;
  }>;
};

function formatDate(text?: string) {
  if (!text) return "-";
  return text.replace("T", " ");
}

export default function AssemblyBuilderPage({ items }: AssemblyBuilderPageProps) {
  const assemblies = useMemo(
    () => items.filter((item) => item.item_type === "assembly"),
    [items],
  );

  const [selectedAssemblyId, setSelectedAssemblyId] = useState<number | null>(null);
  const [components, setComponents] = useState<SelectedComponent[]>([]);
  const [revisions, setRevisions] = useState<AssemblyRevision[]>([]);
  const [currentRevNo, setCurrentRevNo] = useState<number | null>(null);
  const [currentCreatedAt, setCurrentCreatedAt] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [searchType, setSearchType] = useState<Item["item_type"]>("material");
  const [keyword, setKeyword] = useState("");
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Item[]>([]);

  const selectedAssembly = useMemo(
    () => assemblies.find((item) => item.id === selectedAssemblyId) ?? null,
    [assemblies, selectedAssemblyId],
  );

  async function loadAssemblyData(assemblyId: number, revNo?: number) {
    const qp = revNo ? `?rev_no=${revNo}` : "";
    const res = await fetch(`/api/assemblies/${assemblyId}/components${qp}`);
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as AssemblyComponentSet;

    setRevisions(data.revisions ?? []);
    setCurrentRevNo(data.current_rev_no ?? null);
    setCurrentCreatedAt(data.current_created_at ?? "");
    setComponents(
      (data.components ?? []).map((component) => ({
        itemId: component.component_item_id,
        sku: component.sku,
        name: component.name,
        itemType: component.item_type,
        unit: component.managed_unit,
        qtyPerUnit: component.qty_per_unit.toString(),
        note: component.note ?? "",
      })),
    );
  }

  useEffect(() => {
    if (!selectedAssemblyId) {
      setComponents([]);
      setRevisions([]);
      setCurrentRevNo(null);
      setCurrentCreatedAt("");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    loadAssemblyData(selectedAssemblyId)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "failed to load components");
      })
      .finally(() => setLoading(false));
  }, [selectedAssemblyId]);

  function openModal() {
    setModalOpen(true);
    setSearched(false);
    setResults([]);
    setKeyword("");
    setSearchType("material");
  }

  function runSearch() {
    const q = keyword.trim().toLowerCase();
    const filtered = items
      .filter((item) => item.item_type === searchType)
      .filter((item) => {
        if (!selectedAssemblyId) return true;
        return item.id !== selectedAssemblyId;
      })
      .filter((item) => {
        if (!q) return true;
        return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
      })
      .slice(0, 100);

    setResults(filtered);
    setSearched(true);
  }

  function selectItem(item: Item) {
    setComponents((prev) => {
      const exists = prev.find((c) => c.itemId === item.id);
      if (exists) {
        return prev.map((c) =>
          c.itemId === item.id
            ? { ...c, qtyPerUnit: (Number(c.qtyPerUnit || "0") + 1).toString() }
            : c,
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          itemType: item.item_type,
          unit: item.managed_unit,
          qtyPerUnit: "1",
          note: "",
        },
      ];
    });
    setModalOpen(false);
    setMessage("");
    setError("");
  }

  function updateComponent(itemId: number, patch: Partial<SelectedComponent>) {
    setComponents((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, ...patch } : c)));
    setMessage("");
  }

  function removeComponent(itemId: number) {
    setComponents((prev) => prev.filter((c) => c.itemId !== itemId));
    setMessage("");
  }

  async function selectRevision(revNo: number) {
    if (!selectedAssemblyId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await loadAssemblyData(selectedAssemblyId, revNo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load revision");
    } finally {
      setLoading(false);
    }
  }

  async function registerComponents() {
    setError("");
    setMessage("");

    if (!selectedAssemblyId) {
      setError("左のアセンブリを選択してください。");
      return;
    }

    if (components.length === 0) {
      setError("コンポーネントを1件以上追加してください。");
      return;
    }

    const payloadComponents = [] as Array<{
      component_item_id: number;
      qty_per_unit: number;
      note: string;
    }>;

    for (const c of components) {
      const qty = Number(c.qtyPerUnit);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError(`数量が不正です: ${c.sku}`);
        return;
      }
      payloadComponents.push({
        component_item_id: c.itemId,
        qty_per_unit: Number(qty.toFixed(6)),
        note: c.note.trim(),
      });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/assemblies/${selectedAssemblyId}/components`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ components: payloadComponents }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const body = (await res.json()) as { rev_no?: number };
      setMessage(`登録しました。rev ${body.rev_no ?? "-"}`);
      await loadAssemblyData(selectedAssemblyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentRevision() {
    if (!selectedAssemblyId || !currentRevNo) {
      setError("削除対象の revision がありません。");
      return;
    }
    if (!window.confirm(`rev ${currentRevNo} を削除します。`)) return;

    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/assemblies/${selectedAssemblyId}/components/${currentRevNo}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setMessage(`rev ${currentRevNo} を削除しました。`);
      await loadAssemblyData(selectedAssemblyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-black tracking-tight text-gray-900 md:text-4xl">
          Component Combination
        </h1>
        <p className="mt-2 text-sm text-gray-700 md:text-base">
          アセンブリに対して material / assembly を組み合わせて登録します。
        </p>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">Assemblies</h2>
          <div className="mt-3 max-h-[560px] space-y-2 overflow-auto pr-1">
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
            {assemblies.length === 0 && (
              <p className="text-sm text-gray-500">assembly がありません。</p>
            )}
          </div>
        </aside>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Components</h2>
              <p className="text-xs text-gray-500">
                {selectedAssembly
                  ? `${selectedAssembly.sku} | ${selectedAssembly.name}`
                  : "左からアセンブリを選択してください"}
              </p>
              <p className="text-xs text-gray-500">
                {currentRevNo ? `現在: rev ${currentRevNo} (${formatDate(currentCreatedAt)})` : "現在: rev なし"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={currentRevNo ?? ""}
                disabled={!selectedAssembly || revisions.length === 0 || loading}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value > 0) {
                    void selectRevision(value);
                  }
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs"
              >
                {revisions.length === 0 && <option value="">rev none</option>}
                {revisions.map((rev) => (
                  <option key={rev.record_id} value={rev.rev_no}>
                    rev {rev.rev_no} ({formatDate(rev.created_at)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={deleteCurrentRevision}
                disabled={!selectedAssembly || !currentRevNo || deleting || loading}
                className="rounded-full border border-red-300 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "削除中..." : "rev削除"}
              </button>
              <button
                type="button"
                onClick={openModal}
                disabled={!selectedAssembly}
                className="rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Add
              </button>
            </div>
          </div>

          {loading && <p className="py-8 text-sm text-gray-500">読み込み中...</p>}

          {!loading && components.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-500">右側はまだ空です。Add で追加してください。</p>
          )}

          {!loading && components.length > 0 && (
            <div className="mt-4 space-y-3">
              {components.map((component) => (
                <div key={component.itemId} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{component.sku}</p>
                      <p className="text-sm font-bold text-gray-900">{component.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeComponent(component.itemId)}
                      className="text-xs font-bold text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[140px_100px_minmax(0,1fr)]">
                    <label className="text-xs font-semibold text-gray-700">
                      Qty / 1 assy *
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={component.qtyPerUnit}
                        onChange={(e) =>
                          updateComponent(component.itemId, {
                            qtyPerUnit: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-gray-700">
                      Unit
                      <input
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm"
                        value={component.unit}
                        readOnly
                      />
                    </label>
                    <label className="text-xs font-semibold text-gray-700">
                      Note
                      <input
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={component.note}
                        onChange={(e) =>
                          updateComponent(component.itemId, {
                            note: e.target.value,
                          })
                        }
                        placeholder="optional"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={registerComponents}
              disabled={saving || !selectedAssembly}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {saving ? "登録中..." : "登録(RevUp)"}
            </button>
            {message && <span className="text-sm text-emerald-700">{message}</span>}
          </div>

          {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">コンポーネント検索</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full border border-gray-300 px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_120px]">
              <label className="text-xs font-semibold text-gray-700">
                Type
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as Item["item_type"])}
                >
                  <option value="material">material</option>
                  <option value="assembly">assembly</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-700">
                Keyword
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="SKU or Name"
                />
              </label>
              <button
                type="button"
                onClick={runSearch}
                className="mt-[18px] rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white hover:bg-black"
              >
                検索
              </button>
            </div>

            {!searched && (
              <p className="mt-4 text-sm text-gray-500">検索ボタンを押すと一覧を表示します。</p>
            )}

            {searched && (
              <div className="mt-4 max-h-[360px] space-y-2 overflow-auto rounded-xl border border-gray-200 p-2">
                {results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-50"
                  >
                    <p className="font-mono text-xs text-gray-500">{item.sku}</p>
                    <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="px-2 py-3 text-sm text-gray-500">該当なし</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
