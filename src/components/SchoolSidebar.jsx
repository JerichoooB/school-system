import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
    LayoutDashboard,
    User,
    Layers,
    CalendarDays,
    ChartColumn,
    Clock,
    ClipboardPen,
    Megaphone,
    Settings,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    ChevronRight,
    GraduationCap,
} from "lucide-react";

import { useTheme } from "../context/ThemeContext";

import "../styles/SchoolSidebar.css";


/* =========================================================
   NAVIGATION
   ========================================================= */

const navigationGroups = [
    {
        title: "MAIN",

        items: [
            {
                label: "Dashboard",
                path: "/dashboard",
                icon: LayoutDashboard,
            },
            {
                label: "Profile",
                path: "/profile",
                icon: User,
            },
            {
                label: "Courses",
                path: "/courses",
                icon: Layers,
            },
            {
                label: "Schedule",
                path: "/schedule",
                icon: CalendarDays,
            },
        ],
    },

    {
        title: "ACADEMICS",

        items: [
            {
                label: "Grades",
                path: "/grades",
                icon: ChartColumn,
            },
            {
                label: "Attendance",
                path: "/attendance",
                icon: Clock,
            },
            {
                label: "Assignments",
                path: "/assignments",
                icon: ClipboardPen,
            },
        ],
    },

    {
        title: "COMMUNICATION",

        items: [
            {
                label: "Announcements",
                path: "/announcements",
                icon: Megaphone,
            },
        ],
    },
];


/* =========================================================
   SIDEBAR
   ========================================================= */

function SchoolSidebar({
    collapsed: controlledCollapsed,
    setCollapsed: controlledSetCollapsed,
    mobileOpen = false,
    onMobileClose,
    onLogout,
}) {
    const navigate = useNavigate();
    const location = useLocation();

    const { darkMode } = useTheme();


    /* =====================================================
       COLLAPSED STATE

       Supports both:

       <SchoolSidebar />

       and:

       <SchoolSidebar
           collapsed={...}
           setCollapsed={...}
       />
    ===================================================== */

    const [internalCollapsed, setInternalCollapsed] =
        useState(() => {
            try {
                return (
                    localStorage.getItem(
                        "schoolHubSidebarCollapsed"
                    ) === "true"
                );
            } catch {
                return false;
            }
        });


    const isControlled =
        typeof controlledCollapsed === "boolean";


    const collapsed = isControlled
        ? controlledCollapsed
        : internalCollapsed;


    const setCollapsed = (value) => {
        if (controlledSetCollapsed) {
            controlledSetCollapsed(value);
        }

        if (!isControlled) {
            setInternalCollapsed(value);
        }
    };


    /* =====================================================
       SAVE COLLAPSED STATE
    ===================================================== */

    useEffect(() => {
        try {
            localStorage.setItem(
                "schoolHubSidebarCollapsed",
                String(collapsed)
            );
        } catch {
            // Ignore storage errors.
        }
    }, [collapsed]);


    /* =====================================================
       ESCAPE
    ===================================================== */

    useEffect(() => {
        const handleEscape = (event) => {
            if (
                event.key === "Escape" &&
                mobileOpen &&
                onMobileClose
            ) {
                onMobileClose();
            }
        };

        document.addEventListener(
            "keydown",
            handleEscape
        );

        return () => {
            document.removeEventListener(
                "keydown",
                handleEscape
            );
        };
    }, [mobileOpen, onMobileClose]);


    /* =====================================================
       BODY LOCK ON MOBILE
    ===================================================== */

    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }

        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileOpen]);


    /* =====================================================
       NAVIGATION
    ===================================================== */

    const handleNavigation = (path) => {
        navigate(path);

        if (onMobileClose) {
            onMobileClose();
        }
    };


    /* =====================================================
       ACTIVE PAGE
    ===================================================== */

    const isActive = (path) => {
        if (path === "/dashboard") {
            return location.pathname === "/dashboard";
        }

        return (
            location.pathname === path ||
            location.pathname.startsWith(
                `${path}/`
            )
        );
    };


    /* =====================================================
       COLLAPSE
    ===================================================== */

    const toggleCollapsed = () => {
        setCollapsed(!collapsed);
    };


    /* =====================================================
       LOGOUT
    ===================================================== */

    const handleLogout = () => {
        if (onMobileClose) {
            onMobileClose();
        }

        if (typeof onLogout === "function") {
            onLogout();
            return;
        }

        /*
         * Your App.jsx currently defines Login at "/",
         * not "/login".
         */
        navigate("/");
    };


    return (
        <>

            {/* =================================================
                MOBILE OVERLAY
            ================================================== */}

            {mobileOpen && (
                <button
                    type="button"
                    className="school-hub-sidebar-overlay"
                    onClick={onMobileClose}
                    aria-label="Close navigation menu"
                />
            )}


            {/* =================================================
                SIDEBAR
            ================================================== */}

            <aside
                className={[
                    "school-hub-sidebar",

                    collapsed
                        ? "is-collapsed"
                        : "",

                    mobileOpen
                        ? "is-mobile-open"
                        : "",

                    darkMode
                        ? "is-dark"
                        : "is-light",
                ]
                    .filter(Boolean)
                    .join(" ")}
                aria-label="School Hub navigation"
            >


                {/* =================================================
                    HEADER
                ================================================== */}

                <div className="school-hub-sidebar-header">

                    <button
                        type="button"
                        className="school-hub-brand"
                        onClick={() =>
                            handleNavigation(
                                "/dashboard"
                            )
                        }
                        aria-label="Go to dashboard"
                    >

                        <span className="school-hub-logo">
                            <GraduationCap
                                size={20}
                                strokeWidth={1.8}
                            />
                        </span>


                        <span className="school-hub-brand-copy">

                            <strong>
                                SCHOOL HUB
                            </strong>

                            <small>
                                STUDENT PORTAL
                            </small>

                        </span>

                    </button>


                    {/* Mobile close */}

                    <button
                        type="button"
                        className="school-hub-mobile-close"
                        onClick={onMobileClose}
                        aria-label="Close navigation menu"
                    >
                        <X
                            size={18}
                            strokeWidth={1.8}
                        />
                    </button>

                </div>


                {/* =================================================
                    NAVIGATION
                ================================================== */}

                <div className="school-hub-sidebar-content">

                    <nav
                        className="school-hub-navigation"
                        aria-label="Primary navigation"
                    >

                        {navigationGroups.map(
                            (group) => (

                                <div
                                    className="school-hub-navigation-group"
                                    key={group.title}
                                >

                                    <div className="school-hub-navigation-title">
                                        {group.title}
                                    </div>


                                    <div className="school-hub-navigation-items">

                                        {group.items.map(
                                            (item) => {

                                                const Icon =
                                                    item.icon;

                                                const active =
                                                    isActive(
                                                        item.path
                                                    );


                                                return (
                                                    <button
                                                        type="button"
                                                        key={
                                                            item.path
                                                        }
                                                        className={[
                                                            "school-hub-navigation-item",

                                                            active
                                                                ? "is-active"
                                                                : "",
                                                        ]
                                                            .filter(
                                                                Boolean
                                                            )
                                                            .join(
                                                                " "
                                                            )}
                                                        onClick={() =>
                                                            handleNavigation(
                                                                item.path
                                                            )
                                                        }
                                                        aria-current={
                                                            active
                                                                ? "page"
                                                                : undefined
                                                        }
                                                        aria-label={
                                                            collapsed
                                                                ? item.label
                                                                : undefined
                                                        }
                                                        title={
                                                            collapsed
                                                                ? item.label
                                                                : undefined
                                                        }
                                                    >

                                                        <span className="school-hub-navigation-icon">

                                                            <Icon
                                                                size={
                                                                    18
                                                                }
                                                                strokeWidth={
                                                                    1.8
                                                                }
                                                            />

                                                        </span>


                                                        <span className="school-hub-navigation-label">
                                                            {
                                                                item.label
                                                            }
                                                        </span>


                                                        {active &&
                                                            !collapsed && (
                                                                <span className="school-hub-navigation-arrow">

                                                                    <ChevronRight
                                                                        size={
                                                                            14
                                                                        }
                                                                        strokeWidth={
                                                                            2
                                                                        }
                                                                    />

                                                                </span>
                                                            )}

                                                    </button>
                                                );
                                            }
                                        )}

                                    </div>

                                </div>
                            )
                        )}

                    </nav>

                </div>


                {/* =================================================
                    BOTTOM
                ================================================== */}

                <div className="school-hub-sidebar-bottom">


                    {/* SETTINGS */}

                    <button
                        type="button"
                        className={[
                            "school-hub-navigation-item",
                            "sidebar-bottom-item",
                            isActive("/settings")
                                ? "is-active"
                                : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        onClick={() =>
                            handleNavigation(
                                "/settings"
                            )
                        }
                        aria-current={
                            isActive("/settings")
                                ? "page"
                                : undefined
                        }
                        aria-label="Settings"
                        title={
                            collapsed
                                ? "Settings"
                                : undefined
                        }
                    >

                        <span className="school-hub-navigation-icon">

                            <Settings
                                size={18}
                                strokeWidth={1.8}
                            />

                        </span>


                        <span className="school-hub-navigation-label">
                            Settings
                        </span>


                        {isActive("/settings") &&
                            !collapsed && (
                                <span className="school-hub-navigation-arrow">

                                    <ChevronRight
                                        size={14}
                                        strokeWidth={2}
                                    />

                                </span>
                            )}

                    </button>


                    {/* LOGOUT */}

                    <button
                        type="button"
                        className="school-hub-navigation-item sidebar-logout"
                        onClick={handleLogout}
                        aria-label="Logout"
                        title={
                            collapsed
                                ? "Logout"
                                : undefined
                        }
                    >

                        <span className="school-hub-navigation-icon">

                            <LogOut
                                size={18}
                                strokeWidth={1.8}
                            />

                        </span>


                        <span className="school-hub-navigation-label">
                            Log out
                        </span>

                    </button>


                    {/* COLLAPSE */}

                    <button
                        type="button"
                        className="school-hub-collapse-button"
                        onClick={toggleCollapsed}
                        aria-label={
                            collapsed
                                ? "Expand sidebar"
                                : "Collapse sidebar"
                        }
                        title={
                            collapsed
                                ? "Expand sidebar"
                                : "Collapse sidebar"
                        }
                    >

                        {collapsed ? (
                            <PanelLeftOpen
                                size={18}
                                strokeWidth={1.8}
                            />
                        ) : (
                            <PanelLeftClose
                                size={18}
                                strokeWidth={1.8}
                            />
                        )}


                        <span>
                            {collapsed
                                ? "Expand sidebar"
                                : "Collapse sidebar"}
                        </span>

                    </button>

                </div>

            </aside>
        </>
    );
}


export default SchoolSidebar;