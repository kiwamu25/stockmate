import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Item } from "../types/item";

export default function CreateItemPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "product" as Item["category"],
    base_unit: "pcs" as Item["base_unit"],
    stock_managed: true,
    note: "",
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const sku = form.sku.trim();
    const name = form.name.trim();
    if (!sku || !name) {
      setError("SKU and Name are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          name,
          category: form.category,
          base_unit: form.base_unit,
          stock_managed: form.stock_managed,
          note: form.note.trim(),
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      navigate("/items");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-gray-900">Create Item</h1>
        <p className="mt-2 text-sm text-gray-600">
          Add an inventory item with category and base unit.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            SKU
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              placeholder="ITEM-001"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Name
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Sample Item"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Category
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as Item["category"] }))
              }
            >
              <option value="material">material</option>
              <option value="part">part</option>
              <option value="product">product</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Base Unit
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.base_unit}
              onChange={(e) =>
                setForm((f) => ({ ...f, base_unit: e.target.value as Item["base_unit"] }))
              }
            >
              <option value="pcs">pcs</option>
              <option value="g">g</option>
            </select>
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

          <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
            <input
              type="checkbox"
              checked={form.stock_managed}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_managed: e.target.checked }))
              }
            />
            Stock managed
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-gray-900 px-5 py-2 font-bold text-white transition hover:bg-black disabled:opacity-50 md:col-span-2"
          >
            {saving ? "Saving..." : "Create Item"}
          </button>
        </form>
      </div>
    </main>
  );
}
