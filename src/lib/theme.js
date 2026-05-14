import { createContext, useContext } from "react";

// Shared theme context — the inline bootstrap script in index.html sets
// data-theme on <html> before paint to avoid FOUC; <ThemeProvider> in App.jsx
// hydrates from that attribute and keeps it in sync with localStorage plus
// the meta theme-color tag.
//
export const ThemeContext = createContext({ theme: "light", toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);
