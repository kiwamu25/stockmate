import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

export default function Nav() {
  type NavMenuLink = { to: string; label: string; end?: boolean };
  type NavMenuGroup = { key: string; label: string; links: NavMenuLink[] };
  const dashboardLink: NavMenuLink = { to: "/", label: "Dashboard", end: true };

  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
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
      key: "items",
      label: "Items",
      links: [
        { to: "/items", label: "Items", end: true },
        { to: "/items/new", label: "Create" },
      ],
    },
    {
      key: "production",
      label: "Production",
      links: [
        { to: "/production/stock-in", label: "Stock In" },
        { to: "/production/parts", label: "Parts" },
        { to: "/production/shipments", label: "Shipping" },
      ],
    },
    {
      key: "assemblies",
      label: "Assemblies",
      links: [
        { to: "/assemblies/builder", label: "Builder" },
        { to: "/assemblies/adjust", label: "Adjust" },
      ],
    },
  ];

  useEffect(() => {
    setMenuOpen(false);
    setOpenGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (navRootRef.current?.contains(target)) return;
      setMenuOpen(false);
      setOpenGroup(null);
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
          <NavLink to={dashboardLink.to} end={dashboardLink.end} className={linkClass}>
            {dashboardLink.label}
          </NavLink>
          {groups.map((group) => (
            <div key={group.key} className="relative">
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                onClick={() => setOpenGroup((prev) => (prev === group.key ? null : group.key))}
              >
                {group.label}
              </button>
              {openGroup === group.key && (
                <div className="absolute left-0 mt-2 w-44 rounded-lg border border-white/20 bg-gray-900 p-2 shadow-xl">
                  <div className="grid gap-1">
                    {group.links.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.end}
                        className={linkClass}
                        onClick={() => setOpenGroup(null)}
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
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
