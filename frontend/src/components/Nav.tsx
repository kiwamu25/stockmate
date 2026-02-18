import { Link, NavLink } from "react-router-dom";

export default function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-amber-400 text-gray-900"
        : "bg-white/10 text-white hover:bg-white/20"
    }`;

  return (
    <header className="sticky top-0 z-10 border-b border-white/20 bg-gray-900/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link to="/" className="text-lg font-black tracking-tight text-white">
          StockMate
        </Link>
        <nav className="flex gap-2">
          <NavLink to="/" className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/items" end className={linkClass}>
            Items
          </NavLink>
          <NavLink to="/items/new" className={linkClass}>
            Create
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
