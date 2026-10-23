import { useCallback, useEffect, useState } from "react";

import { ThemeContext } from "./theme.js";

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem("theme");

    return savedTheme === "dark";
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");

      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");

      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  const toggleTheme = useCallback(() => setDarkMode((prev) => !prev), []);
  const setAppearance = useCallback((mode) => setDarkMode(mode === "dark"), []);

  return (
    <ThemeContext.Provider
      value={{
        darkMode,
        toggleTheme,
        setAppearance,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
