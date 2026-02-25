import { useEffect, useMemo, useState } from "react";
import FilterBar from "../components/FilterBar";
import type { Item } from "../types/item";
import { formatUtcTextToLocal } from "../utils/datetime";

type AssemblyBuilderPageProps = {
  items: Item[];
};

type SidebarListType = "assembly" | "component";
type ModalComponentTypeFilter = "all" | "material" | "part" | "consumable";

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

function isPartComponent(item: Item) {
  return item.item_type === "component" && item.component?.component_type === "part";
}

function isAnyComponent(item: Item) {
  return item.item_type === "component";
}

export default function AssemblyBuilderPage({ items }: AssemblyBuilderPageProps) {
  const assemblies = useMemo(
    () => items.filter((item) => item.item_type === "assembly"),
    [items],
  );

  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [components, setComponents] = useState<SelectedComponent[]>([]);
  const [revisions, setRevisions] = useState<AssemblyRevision[]>([]);
  const [currentRevNo, setCurrentRevNo] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarListType, setSidebarListType] = useState<SidebarListType>("assembly");
  const [sidebarKeyword, setSidebarKeyword] = useState("");
  const [modalKeyword, setModalKeyword] = useState("");
  const [modalTypeFilter, setModalTypeFilter] = useState<ModalComponentTypeFilter>("all");
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Item[]>([]);

  const selectedParent = useMemo(
    () => items.find((item) => item.id === selectedParentId) ?? null,
    [items, selectedParentId],
  );
  const sidebarItems = useMemo(
    () =>
      sidebarListType === "assembly"
        ? assemblies
        : items.filter((item) => isPartComponent(item)),
    [assemblies, items, sidebarListType],
  );
  const filteredSidebarItems = useMemo(() => {
    const q = sidebarKeyword.trim().toLowerCase();
    if (!q) return sidebarItems;
    return sidebarItems.filter(
      (item) => item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q),
    );
  }, [sidebarItems, sidebarKeyword]);

  useEffect(() => {
    // Avoid updating a different parent item by mistake after switching list type.
    setSelectedParentId(null);
    setComponents([]);
    setRevisions([]);
    setCurrentRevNo(null);
    setError("");
    setMessage("");
  }, [sidebarListType]);

  async function loadAssemblyData(assemblyId: number, revNo?: number) {
    const qp = revNo ? `?rev_no=${revNo}` : "";
    const res = await fetch(`/api/assemblies/${assemblyId}/components${qp}`);
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as AssemblyComponentSet;

    setRevisions(data.revisions ?? []);
    setCurrentRevNo(data.current_rev_no ?? null);
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
    if (!selectedParentId) {
      setComponents([]);
      setRevisions([]);
      setCurrentRevNo(null);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    loadAssemblyData(selectedParentId)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "failed to load components");
      })
      .finally(() => setLoading(false));
  }, [selectedParentId]);

  function openModal() {
    setModalOpen(true);
    setSearched(false);
    setResults([]);
    setModalKeyword("");
    setModalTypeFilter("all");
  }

  function runSearch() {
    const q = modalKeyword.trim().toLowerCase();
    const filtered = items
      .filter((item) => isAnyComponent(item))
      .filter((item) => {
        if (modalTypeFilter === "all") return true;
        return (item.component?.component_type ?? "material") === modalTypeFilter;
      })
      .filter((item) => {
        if (!selectedParentId) return true;
        return item.id !== selectedParentId;
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
    if (!isAnyComponent(item)) {
      setError("component のみ追加できます。");
      return;
    }
    if (!selectedParentId) {
      setError("先に左から対象アイテムを選択してください。");
      return;
    }
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
    if (!selectedParentId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await loadAssemblyData(selectedParentId, revNo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load revision");
    } finally {
      setLoading(false);
    }
  }

  async function registerComponents() {
    setError("");
    setMessage("");

    if (!selectedParentId) {
      setError("左のリストから対象アイテムを選択してください。");
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
      const res = await fetch(`/api/assemblies/${selectedParentId}/components`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ components: payloadComponents }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const body = (await res.json()) as { rev_no?: number };
      setMessage(`登録しました。rev ${body.rev_no ?? "-"}`);
      await loadAssemblyData(selectedParentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentRevision() {
    if (!selectedParentId || !currentRevNo) {
      setError("削除対象の revision がありません。");
      return;
    }
    if (!window.confirm(`rev ${currentRevNo} を削除します。`)) return;

    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/assemblies/${selectedParentId}/components/${currentRevNo}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setMessage(`rev ${currentRevNo} を削除しました。`);
      await loadAssemblyData(selectedParentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-1 md:px-6">
      <div className="rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-2 shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-gray-900 md:text-2xl">
          Component Combination
        </h1>
        <p className="text-xs text-gray-700 px-3">
          component / assembly の生産、出荷時の材料使用量、部品使用量の登録をします。
        </p>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-10">
        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:col-span-4 lg:self-start">
          <h2 className="text-sm border-b border-gray-200 font-bold tracking-wide text-gray-700">Base List</h2>
          <div className="mt-3">
            <FilterBar
              typeValue={sidebarListType}
              onTypeChange={(value) => setSidebarListType(value as SidebarListType)}
              typeOptions={[
                { value: "assembly", label: "assembly" },
                { value: "component", label: "component(part)" },
              ]}
              keywordValue={sidebarKeyword}
              onKeywordChange={setSidebarKeyword}
              keywordPlaceholder="SKU or Name"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {sidebarListType === "assembly"
              ? "assembly を選択してBOM編集対象を切り替えます。"
              : "component(part) を選択してBOM編集対象を切り替えます。"}
          </p>
          <div className="mt-3 sm:max-h-[calc(100vh/2)] md:max-h-[300px] max-h-[200px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
            {filteredSidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedParentId(item.id);
                }}
                className={`w-full rounded-md border px-3 py-2 text-left transition ${selectedParentId === item.id
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs text-gray-500">{item.sku}</p>
                  <p className="text-right text-xs capitalize text-gray-500">
                    {item.item_type === "component" ? (item.component?.component_type ?? "material") : "assembly"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
              </button>
            ))}
            {filteredSidebarItems.length === 0 && (
              <p className="text-sm text-gray-500">
                {sidebarListType === "assembly" ? "assembly がありません。" : "component(part) がありません。"}
              </p>
            )}
          </div>
        </aside>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:col-span-6 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <div className="flex flex-wrap items-center flex-row justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <h2 className="border-b border-gray-200 font-black text-gray-900">Components</h2>
              <p className="text-xs text-gray-500">
                {selectedParent
                  ? (
                    <>
                      {selectedParent.sku}
                      <br />
                      {selectedParent.name}
                    </>
                  )
                  : "BaseListから対象アイテムを選択してください"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={currentRevNo ?? ""}
                disabled={!selectedParent || revisions.length === 0 || loading}
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
                    rev {rev.rev_no} ({formatUtcTextToLocal(rev.created_at)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={deleteCurrentRevision}
                disabled={!selectedParent || !currentRevNo || deleting || loading}
                className="rounded-md border border-red-300 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "削除中..." : "rev削除"}
              </button>

            </div>
          </div>

          <div className="relative mt-4 rounded-lg border border-sky-100 bg-sky-50/60 p-4">
            {components.length === 0 && (
              <p className="py-12 text-center text-sm text-gray-500">componentが選択されていません。Add で追加してください。</p>
            )}

            {components.length > 0 && (
              <div className="space-y-3">
                {components.map((component) => (
                  <div key={component.itemId} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
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

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={openModal}
                disabled={!selectedParent}
                className="rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Component Add
              </button>
            </div>

      
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={registerComponents}
              disabled={saving || !selectedParent}
              className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
          {message && <p className="mt-2 text-right text-sm text-emerald-700">{message}</p>}

          {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">コンポーネント検索</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_120px]">
              <label className="text-xs font-semibold text-gray-700">
                Type
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
                  value={modalTypeFilter}
                  onChange={(e) => setModalTypeFilter(e.target.value as ModalComponentTypeFilter)}
                >
                  <option value="all">all component</option>
                  <option value="material">material</option>
                  <option value="part">part</option>
                  <option value="consumable">consumable</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-700">
                Keyword
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={modalKeyword}
                  onChange={(e) => setModalKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                  placeholder="SKU or Name"
                />
              </label>
              <button
                type="button"
                onClick={runSearch}
                className="mt-[18px] rounded-md bg-gray-900 px-3 py-2 text-sm font-bold text-white hover:bg-black"
              >
                検索
              </button>
            </div>

            {!searched && (
              <p className="mt-4 text-sm text-gray-500">検索ボタンを押すと一覧を表示します。</p>
            )}

            {searched && (
              <div className="mt-4 max-h-[360px] space-y-2 overflow-auto rounded-lg border border-gray-200 p-2">
                {results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-50"
                  >
                    <p className="font-mono text-xs text-gray-500">{item.sku}</p>
                    <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.component?.component_type ?? "-"}</p>
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
