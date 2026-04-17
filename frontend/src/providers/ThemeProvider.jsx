import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEMES = ["tactical", "ghost", "jungle", "wastelander"];
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem("lgss.theme") || "tactical");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lgss.theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
