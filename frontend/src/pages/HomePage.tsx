import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Item } from "../types/item";

type HomePageProps = {
  items: Item[];
};

export default function HomePage({ items }: HomePageProps) {
  const counts = useMemo(() => {
    const base = { material: 0, assembly: 0, sellable: 0, final: 0 };
    for (const item of items) {
      base[item.item_type] += 1;
      if (item.is_sellable) base.sellable += 1;
      if (item.is_final) base.final += 1;
    }
    return base;
  }, [items]);

  const cards = [
    { label: "Total Items", value: items.length },
    { label: "Materials", value: counts.material },
    { label: "Assemblies", value: counts.assembly },
    { label: "Sellable", value: counts.sellable },
    { label: "Final", value: counts.final },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <div className="rounded-3xl bg-gradient-to-br from-cyan-300 via-blue-300 to-gray-300 p-8 shadow-2xl">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-5xl">
          Inventory Home
        </h1>
        <p className="mt-3 max-w-2xl text-gray-800">
          Track items, register new SKUs, and keep your stock definitions clean.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/items/new"
            className="rounded-full bg-gray-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-black"
          >
            Create Item
          </Link>
          <Link
            to="/items"
            className="rounded-full bg-white/80 px-5 py-3 text-sm font-bold text-gray-900 transition hover:bg-white"
          >
            Open Item List
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-5">
        {cards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-black text-gray-900">{card.value}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
