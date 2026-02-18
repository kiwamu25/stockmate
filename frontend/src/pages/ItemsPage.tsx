import type { Item } from "../types/item";

type ItemsPageProps = {
  items: Item[];
  error: string;
};

export default function ItemsPage({ items, error }: ItemsPageProps) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <h1 className="text-xl font-black text-gray-900">Items</h1>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {items.length === 0 ? (
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
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
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
    </main>
  );
}
