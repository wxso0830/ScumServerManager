import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEMES = ["blacksite", "bunker", "ghost", "wastelander"];
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("lgss.theme");
    // migrate legacy theme names
    if (stored && THEMES.includes(stored)) return stored;
    return "blacksite";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lgss.theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
