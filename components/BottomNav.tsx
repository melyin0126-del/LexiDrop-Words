"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/",         icon: "home",          label: "Home" },
  { href: "/library",  icon: "library_books", label: "Library" },
  { href: "/add",      icon: "add_circle",    label: "Add" },
  { href: "/review",   icon: "auto_stories",  label: "Review" },
  { href: "/settings", icon: "settings",      label: "Settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-50 flex justify-around items-center px-4 py-2 rounded-[2rem] bg-white/10 backdrop-blur-xl border border-white/15 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-center rounded-full p-3 transition-all duration-200 ${
              active
                ? "bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] scale-110"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {item.icon}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
