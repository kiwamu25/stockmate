import { useCallback, useEffect, useMemo, useState } from "react";
import ItemCsvTools from "../components/ItemCsvTools";
import type { ComponentType, Item } from "../types/item";

export default function CreateItemPage() {
  type SelectableItemType = Item["item_type"] | "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyItems, setHistoryItems] = useState<Item[]>([]);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    item_type: "" as SelectableItemType,
    managed_unit: "pcs" as Item["managed_unit"],
    pack_qty: "",
    reorder_point: "0",
    stock_managed: true,
    is_sellable: false,
    is_final: false,
    note: "",
  });
  const [assemblyForm, setAssemblyForm] = useState({
    manufacturer: "",
    total_weight: "",
    pack_size: "",
    note: "",
  });
  const [componentForm, setComponentForm] = useState({
    manufacturer: "",
    component_type: "material" as ComponentType,
    color: "",
  });

  function normalizeItemType(value: string): Item["item_type"] {
    if (value === "assembly") return "assembly";
    if (value === "component" || value === "material") return "component";
    return "component";
  }

  function resetFormsByType(itemType: SelectableItemType) {
    setForm({
      sku: "",
      name: "",
      item_type: itemType,
      managed_unit: "pcs",
      pack_qty: "",
      reorder_point: "0",
      stock_managed: true,
      is_sellable: false,
      is_final: false,
      note: "",
    });
    setAssemblyForm({
      manufacturer: "",
      total_weight: "",
      pack_size: "",
      note: "",
    });
    setComponentForm({
      manufacturer: "",
      component_type: "material",
      color: "",
    });
  }

  const loadHistoryItems = useCallback(async () => {
    setHistoryError("");
    try {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("failed to load items");
      const data: Item[] = await res.json();
      setHistoryItems(data);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "failed to load items");
    }
  }, []);

  useEffect(() => {
    void loadHistoryItems();
  }, [loadHistoryItems]);

  const filteredHistory = useMemo(
    () => {
      if (!form.item_type) return [];
      return historyItems
        .filter((item) => normalizeItemType(item.item_type) === form.item_type)
        .slice(0, 8);
    },
    [historyItems, form.item_type],
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const sku = form.sku.trim();
    const name = form.name.trim();
    if (!form.item_type) {
      setError("Item Type is required.");
      return;
    }
    const packQtyText = form.pack_qty.trim();
    const packQty = packQtyText === "" ? null : Number(packQtyText);
    const reorderPointText = form.reorder_point.trim();
    const reorderPoint = reorderPointText === "" ? 0 : Number(reorderPointText);
    const assemblyTotalWeightText = assemblyForm.total_weight.trim();
    const assemblyTotalWeight =
      assemblyTotalWeightText === "" ? null : Number(assemblyTotalWeightText);
    if (!sku || !name) {
      setError("SKU and Name are required.");
      return;
    }
    if (
      packQtyText !== "" &&
      (packQty === null || !Number.isFinite(packQty) || packQty <= 0)
    ) {
      setError("Pack Qty must be a positive number.");
      return;
    }
    if (
      reorderPointText !== "" &&
      (!Number.isFinite(reorderPoint) || reorderPoint < 0)
    ) {
      setError("Reorder Point must be zero or a positive number.");
      return;
    }
    if (
      form.item_type === "assembly" &&
      assemblyTotalWeightText !== "" &&
      (assemblyTotalWeight === null ||
        !Number.isFinite(assemblyTotalWeight) ||
        assemblyTotalWeight <= 0)
    ) {
      setError("Assembly Total Weight must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        sku,
        name,
        item_type: form.item_type,
        managed_unit: form.managed_unit,
        pack_qty: packQty,
        reorder_point: reorderPoint,
        stock_managed: form.stock_managed,
        is_sellable: form.is_sellable,
        is_final: form.is_final,
        note: form.note.trim(),
      };

      if (form.item_type === "assembly") {
        payload.assembly = {
          manufacturer: assemblyForm.manufacturer.trim(),
          total_weight: assemblyTotalWeight,
          pack_size: assemblyForm.pack_size.trim(),
          note: assemblyForm.note.trim(),
        };
      } else if (form.item_type === "component") {
        payload.component = {
          manufacturer: componentForm.manufacturer.trim(),
          component_type: componentForm.component_type.trim(),
          color: componentForm.color.trim(),
        };
      }

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      setSuccess("Item created.");
      resetFormsByType("");
      void loadHistoryItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  function copyFromHistory(item: Item) {
    setForm((f) => ({
      ...f,
      sku: item.sku,
      name: item.name,
      item_type: normalizeItemType(item.item_type),
      managed_unit: item.managed_unit,
      pack_qty: item.pack_qty?.toString() ?? "",
      reorder_point: item.reorder_point?.toString() ?? "0",
      stock_managed: item.stock_managed,
      is_sellable: item.is_sellable,
      is_final: item.is_final,
      note: item.note ?? "",
    }));

    setAssemblyForm({
      manufacturer: item.assembly?.manufacturer ?? "",
      total_weight: item.assembly?.total_weight?.toString() ?? "",
      pack_size: item.assembly?.pack_size ?? "",
      note: item.assembly?.note ?? "",
    });
    setComponentForm({
      manufacturer: item.component?.manufacturer ?? "",
      component_type: item.component?.component_type ?? "material",
      color: item.component?.color ?? "",
    });
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-gray-900">Create Item</h1>
          <p className="mt-2 text-sm text-gray-600">
            Add an inventory item with item type and stock settings.
          </p>
          <ItemCsvTools onImported={loadHistoryItems} />

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Item Type *
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.item_type}
                onChange={(e) => resetFormsByType(e.target.value as SelectableItemType)}
              >
                <option value="">-- select --</option>
                <option value="component">component</option>
                <option value="assembly">assembly</option>
              </select>
            </label>

            {form.item_type !== "" && (
              <div className="md:col-span-2 grid gap-4 md:grid-cols-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <label className="text-sm font-medium text-gray-700">
                  SKU *
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="ITEM-001"
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Name *
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Sample Item"
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
              Managed Unit *
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.managed_unit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, managed_unit: e.target.value as Item["managed_unit"] }))
                }
              >
                <option value="pcs">pcs</option>
                <option value="g">g</option>
              </select>
            </label>

                <label className="text-sm font-medium text-gray-700">
              Pack Qty
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.pack_qty}
                onChange={(e) => setForm((f) => ({ ...f, pack_qty: e.target.value }))}
                placeholder="initial stock quantity if applicable"
              />
            </label>

                <label className="text-sm font-medium text-gray-700">
              Reorder Point
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.reorder_point}
                onChange={(e) => setForm((f) => ({ ...f, reorder_point: e.target.value }))}
                placeholder="minimum stock to keep"
              />
            </label>

                <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Note
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="optional"
              />
            </label>

                {form.item_type === "assembly" && (
              <>
                <label className="text-sm font-medium text-gray-700">
                  Assembly Manufacturer
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={assemblyForm.manufacturer}
                    onChange={(e) =>
                      setAssemblyForm((f) => ({ ...f, manufacturer: e.target.value }))
                    }
                    placeholder="Maker name"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Assembly Total Weight (g)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={assemblyForm.total_weight}
                    onChange={(e) =>
                      setAssemblyForm((f) => ({ ...f, total_weight: e.target.value }))
                    }
                    placeholder="optional"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Pack Size
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={assemblyForm.pack_size}
                    onChange={(e) =>
                      setAssemblyForm((f) => ({ ...f, pack_size: e.target.value }))
                    }
                    placeholder="w x d x h cm"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 md:col-span-2">
                  Assembly Note
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={assemblyForm.note}
                    onChange={(e) => setAssemblyForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="optional"
                  />
                </label>
              </>
            )}

                {form.item_type === "component" && (
              <>
                <label className="text-sm font-medium text-gray-700">
                  Component Manufacturer
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={componentForm.manufacturer}
                    onChange={(e) =>
                      setComponentForm((f) => ({ ...f, manufacturer: e.target.value }))
                    }
                    placeholder="Bambu Lab"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Component Type
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={componentForm.component_type}
                    onChange={(e) =>
                      setComponentForm((f) => ({ ...f, component_type: e.target.value as ComponentType }))
                    }
                  >
                    <option value="material">material</option>
                    <option value="part">part</option>
                    <option value="consumable">consumable</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700 md:col-span-2">
                  Color
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={componentForm.color}
                    onChange={(e) => setComponentForm((f) => ({ ...f, color: e.target.value }))}
                    placeholder="Black"
                  />
                </label>
              </>
            )}

                <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.stock_managed}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stock_managed: e.target.checked }))
                }
              />
              Stock managed *
            </label>

                <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_sellable}
                onChange={(e) => setForm((f) => ({ ...f, is_sellable: e.target.checked }))}
              />
              Sellable *
            </label>

                <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_final}
                onChange={(e) => setForm((f) => ({ ...f, is_final: e.target.checked }))}
              />
              Final item *
            </label>

                <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gray-900 px-5 py-2 font-bold text-white transition hover:bg-black disabled:opacity-50 md:col-span-2"
            >
              {saving ? "Saving..." : "Create Item"}
            </button>
              </div>
            )}
          </form>
        </div>
        <section className="self-start rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-24">
          <h2 className="text-base font-bold text-gray-900">
            Recent {form.item_type || "-"} Items
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Showing latest registrations for the selected item type.
          </p>

          {historyError && (
            <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {historyError}
            </div>
          )}

          {!historyError && form.item_type === "" && (
            <p className="mt-3 text-sm text-gray-500">Select Item Type to show history.</p>
          )}

          {!historyError && form.item_type !== "" && filteredHistory.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No history for this item type yet.</p>
          )}

          {form.item_type !== "" && filteredHistory.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="p-2">SKU</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                      onClick={() => copyFromHistory(item)}
                    >
                      <td className="p-2 font-mono">{item.sku}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.managed_unit}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyFromHistory(item);
                          }}
                          className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-black"
                        >
                          Copy
                        </button>
                      </td>
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
