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
  product_total_weight: string;
  product_pack_size: string;
  product_note: string;
  material_manufacturer: string;
  material_type: string;
  material_color: string;
  part_manufacturer: string;
  part_note: string;
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
    product_total_weight: "",
    product_pack_size: "",
    product_note: "",
    material_manufacturer: "",
    material_type: "",
    material_color: "",
    part_manufacturer: "",
    part_note: "",
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
      product_total_weight: item.product?.total_weight?.toString() ?? "",
      product_pack_size: item.product?.pack_size ?? "",
      product_note: item.product?.note ?? "",
      material_manufacturer: item.material?.manufacturer ?? "",
      material_type: item.material?.material_type ?? "",
      material_color: item.material?.color ?? "",
      part_manufacturer: item.part?.manufacturer ?? "",
      part_note: item.part?.note ?? "",
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
    const totalWeightText = editForm.product_total_weight.trim();
    const totalWeight = totalWeightText === "" ? null : Number(totalWeightText);
    if (
      selectedItem.category === "product" &&
      totalWeightText !== "" &&
      (!Number.isFinite(totalWeight) || Number(totalWeight) <= 0)
    ) {
      setSaveError("Product Total Weight must be a positive number.");
      return;
    }

    const payload: Record<string, unknown> = {
      sku,
      name,
      managed_unit: editForm.managed_unit,
      pack_qty: packQty,
      rev_code: editForm.rev_code.trim(),
      stock_managed: editForm.stock_managed,
      note: editForm.note.trim(),
    };
    if (selectedItem.category === "product") {
      payload.product = {
        total_weight: totalWeight,
        pack_size: editForm.product_pack_size.trim(),
        note: editForm.product_note.trim(),
      };
    } else if (selectedItem.category === "material") {
      payload.material = {
        manufacturer: editForm.material_manufacturer.trim(),
        material_type: editForm.material_type.trim(),
        color: editForm.material_color.trim(),
      };
    } else if (selectedItem.category === "part") {
      payload.part = {
        manufacturer: editForm.part_manufacturer.trim(),
        note: editForm.part_note.trim(),
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
            product:
              item.category === "product"
                ? {
                    total_weight: totalWeight ?? undefined,
                    pack_size: editForm.product_pack_size.trim() || undefined,
                    note: editForm.product_note.trim() || undefined,
                  }
                : item.product,
            material:
              item.category === "material"
                ? {
                    manufacturer: editForm.material_manufacturer.trim() || undefined,
                    material_type: editForm.material_type.trim() || undefined,
                    color: editForm.material_color.trim() || undefined,
                  }
                : item.material,
            part:
              item.category === "part"
                ? {
                    manufacturer: editForm.part_manufacturer.trim() || undefined,
                    note: editForm.part_note.trim() || undefined,
                  }
                : item.part,
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
                  <th className="p-3">Category</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3">Rev</th>
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
                    <td className="p-3 text-sm capitalize text-gray-700">{item.category}</td>
                    <td className="p-3 text-sm text-gray-700">{item.managed_unit}</td>
                    <td className="p-3 text-sm text-gray-700">{item.rev_code || "-"}</td>
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
        <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
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
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                disabled={!editing}
                checked={editing ? editForm.stock_managed : selectedItem.stock_managed}
                onChange={(e) => setEditForm((f) => ({ ...f, stock_managed: e.target.checked }))}
              />
              Stock managed
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

          {selectedItem.category === "product" && (
            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700 md:grid-cols-3">
              <label className="font-medium">
                Total Weight
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.product_total_weight : selectedItem.product?.total_weight?.toString() ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, product_total_weight: e.target.value }))}
                />
              </label>
              <label className="font-medium">
                Pack Size
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.product_pack_size : selectedItem.product?.pack_size ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, product_pack_size: e.target.value }))}
                />
              </label>
              <label className="font-medium">
                Product Note
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.product_note : selectedItem.product?.note ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, product_note: e.target.value }))}
                />
              </label>
            </div>
          )}

          {selectedItem.category === "material" && (
            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700 md:grid-cols-3">
              <label className="font-medium">
                Manufacturer
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.material_manufacturer : selectedItem.material?.manufacturer ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, material_manufacturer: e.target.value }))
                  }
                />
              </label>
              <label className="font-medium">
                Material Type
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.material_type : selectedItem.material?.material_type ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, material_type: e.target.value }))}
                />
              </label>
              <label className="font-medium">
                Color
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.material_color : selectedItem.material?.color ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, material_color: e.target.value }))}
                />
              </label>
            </div>
          )}

          {selectedItem.category === "part" && (
            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700 md:grid-cols-2">
              <label className="font-medium">
                Manufacturer
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.part_manufacturer : selectedItem.part?.manufacturer ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, part_manufacturer: e.target.value }))}
                />
              </label>
              <label className="font-medium">
                Part Note
                <input
                  disabled={!editing}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  value={editing ? editForm.part_note : selectedItem.part?.note ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, part_note: e.target.value }))}
                />
              </label>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
