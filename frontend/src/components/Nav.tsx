import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-amber-400 text-gray-900"
        : "bg-white/10 text-white hover:bg-white/20"
    }`;
  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `w-full rounded-full px-4 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-amber-400 text-gray-900"
        : "bg-white/10 text-white hover:bg-white/20"
    }`;

  return (
    <header className="sticky top-0 z-10 border-b border-white/20 bg-gray-900/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:px-6">
        <div className="relative flex items-center justify-center sm:justify-between">
          <button
            type="button"
            className="absolute left-0 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white sm:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
          <Link to="/" className="text-center text-lg font-black tracking-tight text-white sm:text-left">
            StockMate
          </Link>
        </div>

        <nav className="mt-3 hidden flex-wrap justify-start gap-2 sm:flex">
          <NavLink to="/" className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/items" end className={linkClass}>
            Items
          </NavLink>
          <NavLink to="/items/new" className={linkClass}>
            Create
          </NavLink>
          <NavLink to="/assemblies/builder" className={linkClass}>
            Builder
          </NavLink>
          <NavLink to="/assemblies/adjust" className={linkClass}>
            Adjust
          </NavLink>
        </nav>

        {menuOpen && (
          <nav className="mt-3 grid w-full justify-items-start gap-2 sm:hidden">
            <NavLink to="/" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
              Home
            </NavLink>
            <NavLink to="/items" end className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
              Items
            </NavLink>
            <NavLink to="/items/new" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
              Create
            </NavLink>
            <NavLink
              to="/assemblies/builder"
              className={mobileLinkClass}
              onClick={() => setMenuOpen(false)}
            >
              Builder
            </NavLink>
            <NavLink
              to="/assemblies/adjust"
              className={mobileLinkClass}
              onClick={() => setMenuOpen(false)}
            >
              Adjust
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  );
}
