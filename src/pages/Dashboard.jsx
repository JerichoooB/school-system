import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    Menu,
    X,
    Sun,
    Moon,
    Bell,
    ChevronDown,
    BookOpen,
    ChartColumnIncreasing,
    Clock3,
    ClipboardPen,
    CalendarDays,
    ArrowUpRight,
    Check,
    Circle,
    CircleCheck,
    FileText,
    Megaphone,
    Send,
    UserRound,
} from "lucide-react";

import { useTheme } from "../context/ThemeContext";
import SchoolSidebar from "../components/SchoolSidebar";

import "../styles/dashboard.css";


/* =========================================================
   DEMO DATA
   ========================================================= */

const dashboardStats = [
    {
        title: "Courses Enrolled",
        value: "5",
        description: "Active this semester",
        icon: BookOpen,
        type: "courses",
    },
    {
        title: "Average Grade",
        value: "87.4%",
        description: "Above class average",
        icon: ChartColumnIncreasing,
        type: "grades",
    },
    {
        title: "Attendance",
        value: "92%",
        description: "Good attendance",
        icon: Clock3,
        type: "attendance",
    },
    {
        title: "Pending Assignments",
        value: "3",
        description: "Due this week",
        icon: ClipboardPen,
        type: "assignments",
    },
];

const upcomingSchedule = [
    {
        id: 1,
        title: "Data Structures Lecture",
        course: "CS201",
        time: "10:00 AM - 11:30 AM",
        date: "Today",
        icon: BookOpen,
    },
    {
        id: 2,
        title: "Database Systems Lab",
        course: "CS302",
        time: "2:00 PM - 5:00 PM",
        date: "Today",
        icon: LayersIcon,
    },
    {
        id: 3,
        title: "Algorithms Quiz",
        course: "CS201",
        time: "11:59 PM",
        date: "Tomorrow",
        icon: ClipboardPen,
    },
    {
        id: 4,
        title: "Software Engineering Lecture",
        course: "CS401",
        time: "9:00 AM - 10:30 AM",
        date: "May 20",
        icon: FileText,
    },
];

const initialTasks = [
    {
        id: 1,
        title: "Data Structures Assignment",
        due: "Completed",
        completed: true,
    },
    {
        id: 2,
        title: "Database Lab Report",
        due: "Due today",
        completed: false,
    },
    {
        id: 3,
        title: "Algorithms Quiz",
        due: "Due tomorrow",
        completed: false,
    },
    {
        id: 4,
        title: "Software Design Document",
        due: "Due May 22",
        completed: false,
    },
    {
        id: 5,
        title: "Database Normalization Exercise",
        due: "Due May 23",
        completed: true,
    },
    {
        id: 6,
        title: "Programming Laboratory",
        due: "Completed",
        completed: true,
    },
];

const announcements = [
    {
        id: 1,
        title: "Midterm Exam Schedule Released",
        description:
            "Midterm exams will begin from May 25th. Please check your email for the detailed schedule.",
        author: "Academic Office",
        time: "2 hours ago",
        unread: true,
    },
    {
        id: 2,
        title: "New Course Materials Available",
        description:
            "Course materials for Database Systems have been uploaded to the portal.",
        author: "Dr. Smith",
        time: "1 day ago",
        unread: false,
    },
];

const gradeData = [
    {
        month: "Jan",
        student: 68,
        classAverage: 64,
    },
    {
        month: "Feb",
        student: 76,
        classAverage: 70,
    },
    {
        month: "Mar",
        student: 79,
        classAverage: 73,
    },
    {
        month: "Apr",
        student: 83,
        classAverage: 77,
    },
    {
        month: "May",
        student: 87,
        classAverage: 81,
    },
    {
        month: "Jun",
        student: 87.4,
        classAverage: 82,
    },
];


/* =========================================================
   SMALL FALLBACK ICON
   ========================================================= */

function LayersIcon(props) {
    return <BookOpen {...props} />;
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function Dashboard() {
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    const [tasks, setTasks] = useState(initialTasks);

    const [profileOpen, setProfileOpen] = useState(false);

    const [notificationCount] = useState(3);


    /* =====================================================
       DATE
       ===================================================== */

    const currentDate = useMemo(() => {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        }).format(new Date());
    }, []);


    /* =====================================================
       TASKS
       ===================================================== */

    const completedTasks = tasks.filter(
        (task) => task.completed
    ).length;

    const totalTasks = tasks.length;

    const taskPercentage =
        totalTasks > 0
            ? Math.round(
                  (completedTasks / totalTasks) * 100
              )
            : 0;


    const toggleTask = (taskId) => {
        setTasks((currentTasks) =>
            currentTasks.map((task) =>
                task.id === taskId
                    ? {
                          ...task,
                          completed: !task.completed,
                      }
                    : task
            )
        );
    };


    /* =====================================================
       SIDEBAR
       ===================================================== */

    const handleSidebarToggle = () => {
        setSidebarCollapsed(
            (previous) => !previous
        );
    };


    const openMobileSidebar = () => {
        setMobileSidebarOpen(true);
    };


    const closeMobileSidebar = () => {
        setMobileSidebarOpen(false);
    };


    /* =====================================================
       QUICK ACTIONS
       ===================================================== */

    const quickActions = [
        {
            label: "View Grades",
            icon: ChartColumnIncreasing,
            path: "/grades",
        },
        {
            label: "My Schedule",
            icon: CalendarDays,
            path: "/schedule",
        },
        {
            label: "Submit Assignment",
            icon: Send,
            path: "/assignments",
        },
        {
            label: "View Attendance",
            icon: Clock3,
            path: "/attendance",
        },
    ];


    return (
        <div
            className={[
                "dashboard-layout",
                darkMode
                    ? "dashboard-dark"
                    : "dashboard-light",
                sidebarCollapsed
                    ? "dashboard-sidebar-collapsed"
                    : "",
            ]
                .filter(Boolean)
                .join(" ")}
        >

            {/* =================================================
                GLOBAL SIDEBAR
            ================================================== */}

            <SchoolSidebar
                collapsed={sidebarCollapsed}
                setCollapsed={setSidebarCollapsed}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={closeMobileSidebar}
            />


            {/* =================================================
                MAIN AREA
            ================================================== */}

            <main className="dashboard-main">

                {/* =================================================
                    HEADER
                ================================================== */}

                <header className="dashboard-header">

                    <div className="dashboard-header-left">

                        {/* Desktop sidebar toggle */}
                        <button
                            type="button"
                            className="dashboard-sidebar-toggle desktop-sidebar-toggle"
                            onClick={handleSidebarToggle}
                            aria-label={
                                sidebarCollapsed
                                    ? "Expand sidebar"
                                    : "Collapse sidebar"
                            }
                            title={
                                sidebarCollapsed
                                    ? "Expand sidebar"
                                    : "Collapse sidebar"
                            }
                        >
                            {sidebarCollapsed ? (
                                <Menu
                                    size={20}
                                    strokeWidth={1.8}
                                />
                            ) : (
                                <X
                                    size={20}
                                    strokeWidth={1.8}
                                />
                            )}
                        </button>


                        {/* Mobile menu */}
                        <button
                            type="button"
                            className="dashboard-sidebar-toggle mobile-sidebar-toggle"
                            onClick={openMobileSidebar}
                            aria-label="Open navigation menu"
                        >
                            <Menu
                                size={20}
                                strokeWidth={1.8}
                            />
                        </button>


                        <div className="dashboard-header-title">
                            <span>SCHOOL HUB</span>
                            <strong>Dashboard</strong>
                        </div>

                    </div>


                    <div className="dashboard-header-right">

                        {/* Theme */}
                        <button
                            type="button"
                            className="dashboard-icon-button"
                            onClick={toggleTheme}
                            aria-label="Toggle dark and light mode"
                            title={
                                darkMode
                                    ? "Switch to light mode"
                                    : "Switch to dark mode"
                            }
                        >
                            {darkMode ? (
                                <Sun
                                    size={19}
                                    strokeWidth={1.8}
                                />
                            ) : (
                                <Moon
                                    size={19}
                                    strokeWidth={1.8}
                                />
                            )}
                        </button>


                        {/* Notifications */}
                        <button
                            type="button"
                            className="dashboard-icon-button notification-button"
                            aria-label="View notifications"
                            title="Notifications"
                        >
                            <Bell
                                size={19}
                                strokeWidth={1.8}
                            />

                            {notificationCount > 0 && (
                                <span className="notification-badge">
                                    {notificationCount}
                                </span>
                            )}
                        </button>


                        {/* Student profile */}
                        <div className="dashboard-profile-wrapper">

                            <button
                                type="button"
                                className="dashboard-profile-button"
                                onClick={() =>
                                    setProfileOpen(
                                        (previous) =>
                                            !previous
                                    )
                                }
                                aria-expanded={profileOpen}
                                aria-label="Open student profile menu"
                            >
                                <div className="dashboard-avatar">
                                    JD
                                </div>

                                <div className="dashboard-profile-info">
                                    <strong>
                                        John Doe
                                    </strong>

                                    <span>
                                        Computer Science
                                    </span>
                                </div>

                                <ChevronDown
                                    size={16}
                                    strokeWidth={1.8}
                                    className={
                                        profileOpen
                                            ? "profile-chevron-open"
                                            : ""
                                    }
                                />
                            </button>


                            {profileOpen && (
                                <div className="dashboard-profile-menu">

                                    <button
                                        type="button"
                                        onClick={() =>
                                            navigate(
                                                "/profile"
                                            )
                                        }
                                    >
                                        <UserRound
                                            size={16}
                                        />
                                        Profile
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            navigate(
                                                "/settings"
                                            )
                                        }
                                    >
                                        <Clock3
                                            size={16}
                                        />
                                        Settings
                                    </button>

                                </div>
                            )}

                        </div>

                    </div>

                </header>


                {/* =================================================
                    CONTENT
                ================================================== */}

                <div className="dashboard-content">

                    {/* =================================================
                        WELCOME
                    ================================================== */}

                    <section className="dashboard-welcome">

                        <div>
                            <span className="dashboard-eyebrow">
                                STUDENT OVERVIEW
                            </span>

                            <h1>
                                Welcome back, John!{" "}
                                <span>👋</span>
                            </h1>

                            <p>
                                Here's what's happening with
                                your academic journey today.
                            </p>
                        </div>


                        <div className="dashboard-date">

                            <CalendarDays
                                size={18}
                                strokeWidth={1.8}
                            />

                            <div>
                                <span>
                                    TODAY
                                </span>

                                <strong>
                                    {currentDate}
                                </strong>
                            </div>

                        </div>

                    </section>


                    {/* =================================================
                        STAT CARDS
                    ================================================== */}

                    <section className="dashboard-stats">

                        {dashboardStats.map((stat) => {
                            const Icon = stat.icon;

                            return (
                                <article
                                    className={`dashboard-stat-card ${stat.type}`}
                                    key={stat.title}
                                >

                                    <div className="stat-card-top">

                                        <div className="stat-icon">
                                            <Icon
                                                size={19}
                                                strokeWidth={1.8}
                                            />
                                        </div>

                                        <ArrowUpRight
                                            size={17}
                                            strokeWidth={1.8}
                                            className="stat-arrow"
                                        />

                                    </div>


                                    <div className="stat-card-content">

                                        <span>
                                            {stat.title}
                                        </span>

                                        <strong>
                                            {stat.value}
                                        </strong>

                                        <small>
                                            {stat.description}
                                        </small>

                                    </div>

                                </article>
                            );
                        })}

                    </section>


                    {/* =================================================
                        MAIN GRID
                    ================================================== */}

                    <section className="dashboard-main-grid">


                        {/* =================================================
                            GRADE OVERVIEW
                        ================================================== */}

                        <article className="dashboard-card grade-card">

                            <div className="dashboard-card-header">

                                <div>
                                    <span className="dashboard-card-label">
                                        ACADEMIC PERFORMANCE
                                    </span>

                                    <h2>
                                        Grade Overview
                                    </h2>
                                </div>


                                <select
                                    className="dashboard-select"
                                    defaultValue="semester"
                                    aria-label="Grade period"
                                >
                                    <option value="semester">
                                        This Semester
                                    </option>

                                    <option value="year">
                                        This Year
                                    </option>
                                </select>

                            </div>


                            <div className="grade-summary">

                                <div>
                                    <strong>
                                        87.4%
                                    </strong>

                                    <span>
                                        Current average
                                    </span>
                                </div>

                                <div className="grade-change">
                                    <ArrowUpRight
                                        size={15}
                                    />

                                    +5.2%
                                </div>

                            </div>


                            <GradeChart />

                        </article>


                        {/* =================================================
                            SCHEDULE
                        ================================================== */}

                        <article className="dashboard-card schedule-card">

                            <div className="dashboard-card-header">

                                <div>
                                    <span className="dashboard-card-label">
                                        YOUR CALENDAR
                                    </span>

                                    <h2>
                                        Upcoming Schedule
                                    </h2>
                                </div>


                                <button
                                    type="button"
                                    className="card-link"
                                    onClick={() =>
                                        navigate(
                                            "/schedule"
                                        )
                                    }
                                >
                                    View all
                                    <ArrowUpRight
                                        size={14}
                                    />
                                </button>

                            </div>


                            <div className="schedule-list">

                                {upcomingSchedule.map(
                                    (event) => {
                                        const Icon =
                                            event.icon;

                                        return (
                                            <div
                                                className="schedule-item"
                                                key={event.id}
                                            >

                                                <div className="schedule-icon">
                                                    <Icon
                                                        size={17}
                                                        strokeWidth={
                                                            1.8
                                                        }
                                                    />
                                                </div>


                                                <div className="schedule-info">

                                                    <strong>
                                                        {
                                                            event.title
                                                        }
                                                    </strong>

                                                    <span>
                                                        {
                                                            event.course
                                                        }{" "}
                                                        ·{" "}
                                                        {
                                                            event.time
                                                        }
                                                    </span>

                                                </div>


                                                <span
                                                    className={[
                                                        "schedule-date",
                                                        event.date ===
                                                        "Today"
                                                            ? "today"
                                                            : "",
                                                    ].join(" ")}
                                                >
                                                    {
                                                        event.date
                                                    }
                                                </span>

                                            </div>
                                        );
                                    }
                                )}

                            </div>

                        </article>


                        {/* =================================================
                            TASKS
                        ================================================== */}

                        <article className="dashboard-card tasks-card">

                            <div className="dashboard-card-header">

                                <div>
                                    <span className="dashboard-card-label">
                                        PRODUCTIVITY
                                    </span>

                                    <h2>
                                        My Tasks
                                    </h2>
                                </div>


                                <button
                                    type="button"
                                    className="card-link"
                                    onClick={() =>
                                        navigate(
                                            "/assignments"
                                        )
                                    }
                                >
                                    View all
                                    <ArrowUpRight
                                        size={14}
                                    />
                                </button>

                            </div>


                            <div className="task-progress">

                                <div
                                    className="task-progress-circle"
                                    style={{
                                        "--task-progress": `${taskPercentage}%`,
                                    }}
                                >
                                    <div>
                                        <strong>
                                            {completedTasks}
                                        </strong>

                                        <span>
                                            of {totalTasks}
                                        </span>
                                    </div>
                                </div>


                                <div>
                                    <strong>
                                        Tasks completed
                                    </strong>

                                    <span>
                                        Keep up the good work.
                                    </span>
                                </div>

                            </div>


                            <div className="task-list">

                                {tasks.map((task) => (
                                    <button
                                        type="button"
                                        className={[
                                            "task-item",
                                            task.completed
                                                ? "completed"
                                                : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        key={task.id}
                                        onClick={() =>
                                            toggleTask(
                                                task.id
                                            )
                                        }
                                    >

                                        <span className="task-checkbox">

                                            {task.completed ? (
                                                <CircleCheck
                                                    size={18}
                                                />
                                            ) : (
                                                <Circle
                                                    size={18}
                                                />
                                            )}

                                        </span>


                                        <span className="task-details">

                                            <strong>
                                                {task.title}
                                            </strong>

                                            <small>
                                                {task.due}
                                            </small>

                                        </span>


                                        {task.completed && (
                                            <Check
                                                size={15}
                                                className="task-check"
                                            />
                                        )}

                                    </button>
                                ))}

                            </div>


                            <button
                                type="button"
                                className="add-task-button"
                                onClick={() =>
                                    navigate(
                                        "/assignments"
                                    )
                                }
                            >
                                <ClipboardPen
                                    size={16}
                                />

                                Add new task
                            </button>

                        </article>

                    </section>


                    {/* =================================================
                        LOWER GRID
                    ================================================== */}

                    <section className="dashboard-lower-grid">


                        {/* =================================================
                            ANNOUNCEMENTS
                        ================================================== */}

                        <article className="dashboard-card announcements-card">

                            <div className="dashboard-card-header">

                                <div>
                                    <span className="dashboard-card-label">
                                        COMMUNICATION
                                    </span>

                                    <h2>
                                        Recent Announcements
                                    </h2>
                                </div>


                                <button
                                    type="button"
                                    className="card-link"
                                    onClick={() =>
                                        navigate(
                                            "/announcements"
                                        )
                                    }
                                >
                                    View all
                                    <ArrowUpRight
                                        size={14}
                                    />
                                </button>

                            </div>


                            <div className="announcement-list">

                                {announcements.map(
                                    (announcement) => (
                                        <article
                                            className="announcement-item"
                                            key={
                                                announcement.id
                                            }
                                        >

                                            <div className="announcement-icon">
                                                <Megaphone
                                                    size={18}
                                                    strokeWidth={
                                                        1.8
                                                    }
                                                />
                                            </div>


                                            <div className="announcement-content">

                                                <div className="announcement-title">

                                                    <h3>
                                                        {
                                                            announcement.title
                                                        }
                                                    </h3>

                                                    {announcement.unread && (
                                                        <span className="unread-dot" />
                                                    )}

                                                </div>


                                                <p>
                                                    {
                                                        announcement.description
                                                    }
                                                </p>


                                                <span className="announcement-meta">
                                                    {
                                                        announcement.author
                                                    }{" "}
                                                    ·{" "}
                                                    {
                                                        announcement.time
                                                    }
                                                </span>

                                            </div>

                                        </article>
                                    )
                                )}

                            </div>

                        </article>


                        {/* =================================================
                            QUICK ACTIONS
                        ================================================== */}

                        <article className="dashboard-card quick-actions-card">

                            <div className="dashboard-card-header">

                                <div>
                                    <span className="dashboard-card-label">
                                        SHORTCUTS
                                    </span>

                                    <h2>
                                        Quick Actions
                                    </h2>
                                </div>

                            </div>


                            <div className="quick-actions-grid">

                                {quickActions.map(
                                    (action) => {
                                        const Icon =
                                            action.icon;

                                        return (
                                            <button
                                                type="button"
                                                className="quick-action"
                                                key={
                                                    action.label
                                                }
                                                onClick={() =>
                                                    navigate(
                                                        action.path
                                                    )
                                                }
                                            >

                                                <span className="quick-action-icon">
                                                    <Icon
                                                        size={19}
                                                        strokeWidth={
                                                            1.8
                                                        }
                                                    />
                                                </span>

                                                <span>
                                                    {
                                                        action.label
                                                    }
                                                </span>

                                                <ArrowUpRight
                                                    size={15}
                                                    className="quick-action-arrow"
                                                />

                                            </button>
                                        );
                                    }
                                )}

                            </div>

                        </article>

                    </section>

                </div>

            </main>

        </div>
    );
}


/* =========================================================
   SVG GRADE CHART
   ========================================================= */

function GradeChart() {
    const width = 700;
    const height = 260;

    const paddingLeft = 42;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 42;

    const chartWidth =
        width -
        paddingLeft -
        paddingRight;

    const chartHeight =
        height -
        paddingTop -
        paddingBottom;

    const minValue = 60;
    const maxValue = 100;

    const getX = (index) => {
        if (gradeData.length === 1) {
            return paddingLeft;
        }

        return (
            paddingLeft +
            (index /
                (gradeData.length - 1)) *
                chartWidth
        );
    };

    const getY = (value) => {
        return (
            paddingTop +
            ((maxValue - value) /
                (maxValue - minValue)) *
                chartHeight
        );
    };

    const createPath = (key) => {
        return gradeData
            .map((point, index) => {
                const x = getX(index);
                const y = getY(point[key]);

                return `${index === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" ");
    };


    const studentPath = createPath(
        "student"
    );

    const classPath = createPath(
        "classAverage"
    );


    const yLines = [60, 70, 80, 90, 100];


    return (
        <div className="grade-chart">

            <div className="grade-chart-legend">

                <div>
                    <span className="legend-dot student" />
                    Your Average
                </div>

                <div>
                    <span className="legend-dot class-average" />
                    Class Average
                </div>

            </div>


            <svg
                className="grade-chart-svg"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Grade progression chart"
            >

                {yLines.map((value) => {
                    const y = getY(value);

                    return (
                        <g key={value}>

                            <line
                                x1={paddingLeft}
                                x2={width - paddingRight}
                                y1={y}
                                y2={y}
                                className="chart-grid-line"
                            />

                            <text
                                x={paddingLeft - 10}
                                y={y + 4}
                                textAnchor="end"
                                className="chart-axis-label"
                            >
                                {value}
                            </text>

                        </g>
                    );
                })}


                <path
                    d={classPath}
                    className="grade-class-line"
                    fill="none"
                />


                <path
                    d={studentPath}
                    className="grade-student-line"
                    fill="none"
                />


                {gradeData.map(
                    (point, index) => {
                        const x = getX(index);
                        const y = getY(
                            point.student
                        );

                        return (
                            <g
                                key={
                                    point.month
                                }
                            >

                                <circle
                                    cx={x}
                                    cy={y}
                                    r="4"
                                    className="grade-student-point"
                                />

                                <text
                                    x={x}
                                    y={
                                        height -
                                        14
                                    }
                                    textAnchor="middle"
                                    className="chart-month-label"
                                >
                                    {
                                        point.month
                                    }
                                </text>

                            </g>
                        );
                    }
                )}

            </svg>

        </div>
    );
}


export default Dashboard;