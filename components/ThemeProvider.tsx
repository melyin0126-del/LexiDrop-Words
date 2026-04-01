"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("lexidrop_theme") as Theme | null;
    const t = saved ?? "dark";
    setTheme(t);
    document.documentElement.className = t;
  }, []);

  const toggle = () => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("lexidrop_theme", next);
      document.documentElement.className = next;
      return next;
    });
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

/** Floating theme toggle pill — place anywhere */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`relative w-14 h-7 rounded-full border transition-all duration-300 flex items-center px-0.5 ${
        theme === "light"
          ? "bg-indigo-50 border-indigo-200"
          : "bg-indigo-500/20 border-indigo-500/30"
      }`}
    >
      {/* Track icons */}
      <span className="absolute left-1.5 text-[11px]">🌙</span>
      <span className="absolute right-1.5 text-[11px]">☀️</span>

      {/* Thumb */}
      <span
        className={`relative z-10 w-6 h-6 rounded-full shadow-md flex items-center justify-center text-xs transition-all duration-300 ${
          theme === "light"
            ? "translate-x-7 bg-white"
            : "translate-x-0 bg-indigo-500"
        }`}
      >
        {theme === "dark" ? "🌙" : "☀️"}
      </span>
    </button>
  );
}
