import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

// 8 distinct themes — bunker is the default. Removed: blacksite, ghost,
// wastelander, blood-moon, arctic (felt similar to bunker/carbon/neon-grid).
// Added 5 visually distinctive palettes (toxic, inferno, arctic-storm, royal, synthwave).
const THEMES = ["bunker", "neon-grid", "carbon", "toxic", "inferno", "arctic-storm", "royal", "synthwave"];
const DEFAULT_THEME = "bunker";

// Maps legacy theme names (removed in v1.0.12) to a similar replacement so
// existing users don't suddenly jump back to default.
const THEME_MIGRATIONS = {
  blacksite: "carbon",
  ghost: "arctic-storm",
  wastelander: "bunker",
  "blood-moon": "inferno",
  arctic: "arctic-storm",
};

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("lgss.theme");
    if (!stored) return DEFAULT_THEME;
    if (THEMES.includes(stored)) return stored;
    if (THEME_MIGRATIONS[stored]) return THEME_MIGRATIONS[stored];
    return DEFAULT_THEME;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lgss.theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
