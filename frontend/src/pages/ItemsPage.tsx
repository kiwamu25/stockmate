import { useEffect, useMemo, useState } from "react";
import type { Item } from "../types/item";

type ItemsPageProps = {
  items: Item[];
  error: string;
};

type EditForm = {
  sku: string;
  name: string;
  managed_unit: Item["managed_unit"];
  pack_qty: string;
  rev_code: string;
  note: string;
  stock_managed: boolean;
  is_sellable: boolean;
  is_final: boolean;
  output_category: string;
  assembly_manufacturer: string;
  assembly_total_weight: string;
  assembly_pack_size: string;
  assembly_note: string;
  component_manufacturer: string;
  component_type: string;
  component_color: string;
};

export default function ItemsPage({ items, error }: ItemsPageProps) {
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editForm, setEditForm] = useState<EditForm>({
    sku: "",
    name: "",
    managed_unit: "pcs",
    pack_qty: "",
    rev_code: "",
    note: "",
    stock_managed: true,
    is_sellable: false,
    is_final: false,
    output_category: "",
    assembly_manufacturer: "",
    assembly_total_weight: "",
    assembly_pack_size: "",
    assembly_note: "",
    component_manufacturer: "",
    component_type: "",
    component_color: "",
  });

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const selectedItem = useMemo(
    () => localItems.find((item) => item.id === selectedId) ?? null,
    [localItems, selectedId],
  );

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
      rev_code: item.rev_code ?? "",
      note: item.note ?? "",
      stock_managed: item.stock_managed,
      is_sellable: item.is_sellable,
      is_final: item.is_final,
      output_category: item.output_category ?? "",
      assembly_manufacturer: item.assembly?.manufacturer ?? "",
      assembly_total_weight: item.assembly?.total_weight?.toString() ?? "",
      assembly_pack_size: item.assembly?.pack_size ?? "",
      assembly_note: item.assembly?.note ?? "",
      component_manufacturer: item.component?.manufacturer ?? "",
      component_type: item.component?.component_type ?? "material",
      component_color: item.component?.color ?? "",
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
    if (packQtyText !== "" && (!Number.isFinite(packQty) || Number(packQty) <= 0)) {
      setSaveError("Pack Qty must be a positive number.");
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
      rev_code: editForm.rev_code.trim(),
      stock_managed: editForm.stock_managed,
      is_sellable: editForm.is_sellable,
      is_final: editForm.is_final,
      output_category: editForm.output_category.trim(),
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
      payload.component = {
        manufacturer: editForm.component_manufacturer.trim(),
        component_type: editForm.component_type.trim(),
        color: editForm.component_color.trim(),
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
            rev_code: editForm.rev_code.trim() || undefined,
            note: editForm.note.trim() || undefined,
            stock_managed: editForm.stock_managed,
            is_sellable: editForm.is_sellable,
            is_final: editForm.is_final,
            output_category: editForm.output_category.trim() || undefined,
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
                    component_type: editForm.component_type.trim() || undefined,
                    color: editForm.component_color.trim() || undefined,
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
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {localItems.length === 0 ? (
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
                  {localItems.map((item) => (
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
              Rev Code
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.rev_code : selectedItem.rev_code ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, rev_code: e.target.value }))}
              />
            </label>
            <label className="font-medium">
              Output Category
              <input
                disabled={!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                value={editing ? editForm.output_category : selectedItem.output_category ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, output_category: e.target.value }))}
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
                  onChange={(e) => setEditForm((f) => ({ ...f, component_type: e.target.value }))}
                >
                  <option value="material">material</option>
                  <option value="part">part</option>
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
            </div>
          )}
          </section>
        )}
      </div>
    </main>
  );
}
