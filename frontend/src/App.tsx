import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Nav from "./components/Nav";
import AssemblyBuilderPage from "./pages/AssemblyBuilderPage";
import AssemblyStockAdjustPage from "./pages/AssemblyStockAdjustPage";
import CreateItemPage from "./pages/CreateItemPage";
import HomePage from "./pages/HomePage";
import ItemsPage from "./pages/ItemsPage";
import type { Item } from "./types/item";

export default function App() {
  const location = useLocation();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/items", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data: Item[]) => setItems(data))
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "API error");
      });

    return () => controller.abort();
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700">
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage items={items} />} />
        <Route path="/items" element={<ItemsPage items={items} error={error} />} />
        <Route path="/items/new" element={<CreateItemPage />} />
        <Route path="/assemblies/builder" element={<AssemblyBuilderPage items={items} />} />
        <Route path="/assemblies/adjust" element={<AssemblyStockAdjustPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
