import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

export default function Nav() {
  type NavMenuLink = { to: string; label: string; end?: boolean };
  type NavMenuGroup = { key: string; label: string; links: NavMenuLink[] };
  const dashboardLink: NavMenuLink = { to: "/", label: "Dashboard", end: true };

  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRootRef = useRef<HTMLElement | null>(null);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-amber-400 text-gray-900"
        : "bg-white/10 text-white hover:bg-white/20"
    }`;
  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-amber-400 text-gray-900"
        : "bg-white/10 text-white hover:bg-white/20"
    }`;
  const groups: NavMenuGroup[] = [
    {
      key: "settings",
      label: "基本の設定",
      links: [
        { to: "/items", label: "items-edit", end: true },
        { to: "/items/new", label: "items-create" },
        { to: "/production/stock-in", label: "stock-in" },
        { to: "/assemblies/adjust", label: "assemblies-adjust" },
        { to: "/assemblies/builder", label: "assemblies-builder" },
      ],
    },
    {
      key: "manufacturing",
      label: "生産ー出荷",
      links: [
        { to: "/manufacturing/parts", label: "Parts生産" },
        { to: "/manufacturing/shipments", label: "出荷" },
      ],
    },
  ];

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (navRootRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  return (
    <header ref={navRootRef} className="sticky top-0 z-10 border-b border-white/20 bg-gray-900/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:px-6">
        <div className="relative flex items-center justify-center sm:justify-between">
          <button
            type="button"
            className="absolute left-0 rounded-lg border border-white/2 px-3 py-2 text-sm font-semibold text-white sm:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
          <Link to="/" className="inline-flex items-center gap-2 text-center sm:text-left">
            <img
              src="/favicon.svg"
              alt="Stockmate"
              className="h-9 w-9 rounded-md  p-0.5 shadow-sm"
            />
            <span className="text-lg font-black tracking-tight text-orange-300 drop-shadow-sm">StockMate</span>
          </Link>
        </div>

        <nav className="mt-3 hidden flex-wrap justify-start gap-2 sm:flex">
          <NavLink to={dashboardLink.to} end={dashboardLink.end} className={linkClass}>
            {dashboardLink.label}
          </NavLink>
          {groups.map((group) => (
            <div key={group.key} className="group relative">
              <div className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
                {group.label}
              </div>
              <div className="pointer-events-none invisible absolute left-0 top-full w-48 pt-2 opacity-0 transition group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100">
                <div className="grid gap-1 rounded-lg border border-white/20 bg-gray-900 p-2 shadow-xl">
                  {group.links.map((link) => (
                    <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>

        {menuOpen && (
          <nav className="mt-3 grid w-full gap-3 sm:hidden">
            <section className="rounded-lg border border-white/20 bg-white/5 p-2">
              <NavLink
                to={dashboardLink.to}
                end={dashboardLink.end}
                className={mobileLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                {dashboardLink.label}
              </NavLink>
            </section>
            {groups.map((group) => (
              <section key={group.key} className="rounded-lg border border-white/20 bg-white/5 p-2">
                <h2 className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-white/80">
                  {group.label}
                </h2>
                <div className="grid gap-1">
                  {group.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.end}
                      className={mobileLinkClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
