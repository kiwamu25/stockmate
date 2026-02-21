import { useEffect, useMemo, useState } from "react";
import FilterBar from "../components/FilterBar";
import type { ComponentType, Item } from "../types/item";

type ItemsPageProps = {
  items: Item[];
  error: string;
};

type EditForm = {
  sku: string;
  name: string;
  managed_unit: Item["managed_unit"];
  pack_qty: string;
  reorder_point: string;
  note: string;
  stock_managed: boolean;
  is_sellable: boolean;
  is_final: boolean;
  assembly_manufacturer: string;
  assembly_total_weight: string;
  assembly_pack_size: string;
  assembly_note: string;
  component_manufacturer: string;
  component_type: ComponentType;
  component_color: string;
  component_purchase_urls: string[];
};

export default function ItemsPage({ items, error }: ItemsPageProps) {
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "assembly" | "material" | "part" | "consumable">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editForm, setEditForm] = useState<EditForm>({
    sku: "",
    name: "",
    managed_unit: "pcs",
    pack_qty: "",
    reorder_point: "0",
    note: "",
    stock_managed: true,
    is_sellable: false,
    is_final: false,
    assembly_manufacturer: "",
    assembly_total_weight: "",
    assembly_pack_size: "",
    assembly_note: "",
    component_manufacturer: "",
    component_type: "material",
    component_color: "",
    component_purchase_urls: [],
  });

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const selectedItem = useMemo(
    () => localItems.find((item) => item.id === selectedId) ?? null,
    [localItems, selectedId],
  );

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return localItems.filter((item) => {
      if (typeFilter === "assembly" && item.item_type !== "assembly") return false;
      if (typeFilter === "material") {
        if (item.item_type !== "component") return false;
        if ((item.component?.component_type ?? "material") !== "material") return false;
      }
      if (typeFilter === "part") {
        if (item.item_type !== "component") return false;
        if (item.component?.component_type !== "part") return false;
      }
      if (typeFilter === "consumable") {
        if (item.item_type !== "component") return false;
        if (item.component?.component_type !== "consumable") return false;
      }

      if (!q) return true;
      return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    });
  }, [keyword, localItems, typeFilter]);

  function selectItem(id: number) {
    setSelectedId((prev) => (prev === id ? null : id));
    setEditing(false);
    setSaveError("");
  }

  function startEdit(item: Item) {
    setEditForm({
      sku: item.sku,
      name: item.name,
      managed_unit: item.managed_unit,
      pack_qty: item.pack_qty?.toString() ?? "",
      reorder_point: item.reorder_point?.toString() ?? "0",
      note: item.note ?? "",
      stock_managed: item.stock_managed,
      is_sellable: item.is_sellable,
      is_final: item.is_final,
      assembly_manufacturer: item.assembly?.manufacturer ?? "",
      assembly_total_weight: item.assembly?.total_weight?.toString() ?? "",
      assembly_pack_size: item.assembly?.pack_size ?? "",
      assembly_note: item.assembly?.note ?? "",
      component_manufacturer: item.component?.manufacturer ?? "",
      component_type: item.component?.component_type ?? "material",
      component_color: item.component?.color ?? "",
      component_purchase_urls:
        item.component?.purchase_links?.map((link) => link.url).filter((url) => url.trim() !== "") ?? [],
    });
    setSaveError("");
    setEditing(true);
  }

  async function completeEdit() {
    if (!selectedItem) return;

    const sku = editForm.sku.trim();
    const name = editForm.name.trim();
    if (!sku || !name) {
      setSaveError("SKU and Name are required.");
      return;
    }
    const packQtyText = editForm.pack_qty.trim();
    const packQty = packQtyText === "" ? null : Number(packQtyText);
    const reorderPointText = editForm.reorder_point.trim();
    const reorderPoint = reorderPointText === "" ? 0 : Number(reorderPointText);
    if (packQtyText !== "" && (!Number.isFinite(packQty) || Number(packQty) <= 0)) {
      setSaveError("Pack Qty must be a positive number.");
      return;
    }
    if (reorderPointText !== "" && (!Number.isFinite(reorderPoint) || Number(reorderPoint) < 0)) {
      setSaveError("Reorder Point must be zero or a positive number.");
      return;
    }
    const totalWeightText = editForm.assembly_total_weight.trim();
    const totalWeight = totalWeightText === "" ? null : Number(totalWeightText);
    if (
      selectedItem.item_type === "assembly" &&
      totalWeightText !== "" &&
      (!Number.isFinite(totalWeight) || Number(totalWeight) <= 0)
    ) {
      setSaveError("Assembly Total Weight must be a positive number.");
      return;
    }

    const payload: Record<string, unknown> = {
      sku,
      name,
      managed_unit: editForm.managed_unit,
      pack_qty: packQty,
      reorder_point: reorderPoint,
      stock_managed: editForm.stock_managed,
      is_sellable: editForm.is_sellable,
      is_final: editForm.is_final,
      note: editForm.note.trim(),
    };

    if (selectedItem.item_type === "assembly") {
      payload.assembly = {
        manufacturer: editForm.assembly_manufacturer.trim(),
        total_weight: totalWeight,
        pack_size: editForm.assembly_pack_size.trim(),
        note: editForm.assembly_note.trim(),
      };
    } else if (selectedItem.item_type === "component") {
      const purchaseLinks = editForm.component_purchase_urls
        .map((url) => url.trim())
        .filter((url) => url !== "")
        .map((url) => ({ url }));
      payload.component = {
        manufacturer: editForm.component_manufacturer.trim(),
        component_type: editForm.component_type,
        color: editForm.component_color.trim(),
        purchase_links: purchaseLinks,
      };
    }

    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/items/${selectedItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      setLocalItems((prev) =>
        prev.map((item) => {
          if (item.id !== selectedItem.id) return item;
          return {
            ...item,
            sku,
            name,
            managed_unit: editForm.managed_unit,
            pack_qty: packQty ?? undefined,
            reorder_point: reorderPoint,
            note: editForm.note.trim() || undefined,
            stock_managed: editForm.stock_managed,
            is_sellable: editForm.is_sellable,
            is_final: editForm.is_final,
            assembly:
              item.item_type === "assembly"
                ? {
                    manufacturer: editForm.assembly_manufacturer.trim() || undefined,
                    total_weight: totalWeight ?? undefined,
                    pack_size: editForm.assembly_pack_size.trim() || undefined,
                    note: editForm.assembly_note.trim() || undefined,
                  }
                : item.assembly,
            component:
              item.item_type === "component"
                ? {
                    manufacturer: editForm.component_manufacturer.trim() || undefined,
                    component_type: editForm.component_type,
                    color: editForm.component_color.trim() || undefined,
                    purchase_links: editForm.component_purchase_urls
                      .map((url, idx) => ({ url: url.trim(), sort_order: idx, enabled: true }))
                      .filter((row) => row.url !== ""),
                  }
                : item.component,
          };
        }),
      );
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to update item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <div className="2xl:grid 2xl:grid-cols-[minmax(0,1fr)_460px] 2xl:items-start 2xl:gap-5">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <h1 className="text-xl font-black text-gray-900">Items</h1>
            <p className="mt-1 text-xs text-gray-500">Click a row to open detail editor.</p>
            <div className="mt-3">
              <FilterBar
                keywordValue={keyword}
                onKeywordChange={setKeyword}
                keywordPlaceholder="sku / name"
                typeValue={typeFilter}
                onTypeChange={(value) =>
                  setTypeFilter(value as "all" | "assembly" | "material" | "part" | "consumable")
                }
                typeOptions={[
                  { value: "all", label: "all" },
                  { value: "assembly", label: "assembly" },
                  { value: "material", label: "material" },
                  { value: "part", label: "part" },
                  { value: "consumable", label: "consumable" },
                ]}
              />
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <p className="px-6 py-8 text-gray-500">No items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase tracking-wider text-gray-600">
                    <th className="p-3">ID</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Sellable</th>
                    <th className="p-3">Final</th>
                    <th className="p-3">Managed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => selectItem(item.id)}
                      className={`cursor-pointer border-b border-gray-100 ${
                        selectedId === item.id ? "bg-amber-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="p-3 text-sm text-gray-700">{item.id}</td>
                      <td className="p-3 font-mono text-sm text-gray-900">{item.sku}</td>
                      <td className="p-3 text-sm text-gray-900">{item.name}</td>
                      <td className="p-3 text-sm capitalize text-gray-700">{item.item_type}</td>
                      <td className="p-3 text-sm text-gray-700">{item.managed_unit}</td>
                      <td className="p-3 text-sm text-gray-700">{item.is_sellable ? "Yes" : "No"}</td>
                      <td className="p-3 text-sm text-gray-700">{item.is_final ? "Yes" : "No"}</td>
                      <td className="p-3 text-sm">
                        {item.stock_managed ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                            Yes
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-500">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedItem && (
          <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm 2xl:sticky 2xl:top-24 2xl:mt-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Item Detail</h2>
              <p className="mt-1 text-sm text-gray-600">
                {selectedItem.sku} / {selectedItem.name}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => (editing ? completeEdit() : startEdit(selectedItem))}
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {editing ? (saving ? "Saving..." : "Complete") : "Edit"}
            </button>
          </div>

          {saveError && (
            <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="mt-4 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
            <label className="font-medium">
              SKU
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.sku : selectedItem.sku}
                onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </label>
            <label className="font-medium">
              Name
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.name : selectedItem.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="font-medium">
              Item Type
              <input
                disabled
                className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2"
                value={selectedItem.item_type}
              />
            </label>
            <label className="font-medium">
              Managed Unit
              <select
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.managed_unit : selectedItem.managed_unit}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, managed_unit: e.target.value as Item["managed_unit"] }))
                }
              >
                <option value="pcs">pcs</option>
                <option value="g">g</option>
              </select>
            </label>
            <label className="font-medium">
              Pack Qty
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.pack_qty : selectedItem.pack_qty?.toString() ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, pack_qty: e.target.value }))}
              />
            </label>
            <label className="font-medium">
              Reorder Point
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.reorder_point : selectedItem.reorder_point?.toString() ?? "0"}
                onChange={(e) => setEditForm((f) => ({ ...f, reorder_point: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                disabled={!editing}
                checked={editing ? editForm.stock_managed : selectedItem.stock_managed}
                onChange={(e) => setEditForm((f) => ({ ...f, stock_managed: e.target.checked }))}
              />
              Stock managed
            </label>
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                disabled={!editing}
                checked={editing ? editForm.is_sellable : selectedItem.is_sellable}
                onChange={(e) => setEditForm((f) => ({ ...f, is_sellable: e.target.checked }))}
              />
              Sellable
            </label>
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                disabled={!editing}
                checked={editing ? editForm.is_final : selectedItem.is_final}
                onChange={(e) => setEditForm((f) => ({ ...f, is_final: e.target.checked }))}
              />
              Final item
            </label>
            <label className="font-medium md:col-span-2">
              Note
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.note : selectedItem.note ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
          </div>

          {selectedItem.item_type === "assembly" && (
            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700 md:grid-cols-2">
              <label className="font-medium">
                Manufacturer
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.assembly_manufacturer : selectedItem.assembly?.manufacturer ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, assembly_manufacturer: e.target.value }))}
                />
              </label>
              <label className="font-medium">
                Total Weight
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.assembly_total_weight : selectedItem.assembly?.total_weight?.toString() ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, assembly_total_weight: e.target.value }))}
                />
              </label>
              <label className="font-medium">
                Pack Size
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.assembly_pack_size : selectedItem.assembly?.pack_size ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, assembly_pack_size: e.target.value }))}
                />
              </label>
              <label className="font-medium md:col-span-2">
                Assembly Note
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.assembly_note : selectedItem.assembly?.note ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, assembly_note: e.target.value }))}
                />
              </label>
            </div>
          )}

          {selectedItem.item_type === "component" && (
            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700 md:grid-cols-3">
              <label className="font-medium">
                Manufacturer
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.component_manufacturer : selectedItem.component?.manufacturer ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, component_manufacturer: e.target.value }))
                  }
                />
              </label>
              <label className="font-medium">
                Component Type
                <select
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.component_type : selectedItem.component?.component_type ?? "material"}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, component_type: e.target.value as ComponentType }))
                  }
                >
                  <option value="material">material</option>
                  <option value="part">part</option>
                  <option value="consumable">consumable</option>
                </select>
              </label>
              <label className="font-medium">
                Color
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.component_color : selectedItem.component?.color ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, component_color: e.target.value }))}
                />
              </label>
              <div className="font-medium md:col-span-3">
                Purchase URLs
                {editing ? (
                  <div className="mt-2 space-y-2">
                    {editForm.component_purchase_urls.map((url, idx) => (
                      <div key={`${idx}-${url}`} className="flex items-center gap-2">
                        <input
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                          value={url}
                          onChange={(e) =>
                            setEditForm((f) => {
                              const next = [...f.component_purchase_urls];
                              next[idx] = e.target.value;
                              return { ...f, component_purchase_urls: next };
                            })
                          }
                          placeholder="https://..."
                        />
                        <button
                          type="button"
                          className="rounded-full border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          onClick={() =>
                            setEditForm((f) => ({
                              ...f,
                              component_purchase_urls: f.component_purchase_urls.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div>
                      <button
                        type="button"
                        className="rounded-full border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        onClick={() =>
                          setEditForm((f) => ({
                            ...f,
                            component_purchase_urls: [...f.component_purchase_urls, ""],
                          }))
                        }
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1 text-sm">
                    {selectedItem.component?.purchase_links && selectedItem.component.purchase_links.length > 0 ? (
                      selectedItem.component.purchase_links.map((link) => (
                        <a
                          key={`${link.id ?? link.url}-${link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block break-all text-blue-700 underline"
                        >
                          {link.url}
                        </a>
                      ))
                    ) : (
                      <p className="text-gray-500">-</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          </section>
        )}
      </div>
    </main>
  );
}
