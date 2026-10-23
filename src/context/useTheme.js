import { useContext } from "react";
import { ThemeContext } from "./theme.js";
export function useTheme() { return useContext(ThemeContext); }
