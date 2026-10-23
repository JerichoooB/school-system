import { useEffect, useState } from "react";

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


    function toggleTheme() {

        setDarkMode(prev => !prev);

    }


    return (
        <ThemeContext.Provider
            value={{
                darkMode,
                toggleTheme
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}
