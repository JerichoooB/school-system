import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Support from "./pages/Support";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Portal from "./school/Portal";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

import ProtectedRoute from "./components/ProtectedRoute";

import { ThemeProvider } from "./context/ThemeContext";

function App() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token && /^[a-f0-9]{64}$/.test(token))
      sessionStorage.setItem("school-invitation", token);
  }, []);
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/support" element={<Support />} />

          <Route path="/" element={<Login />} />

          <Route path="/signup" element={<Signup />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Portal key="dashboard" />
              </ProtectedRoute>
            }
          />

          {[
            "profile",
            "courses",
            "schedule",
            "grades",
            "attendance",
            "assignments",
            "announcements",
            "exams",
            "students",
            "teachers",
            "settings",
            "help",
          ].map((path) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <ProtectedRoute>
                  <Portal key={path} />
                </ProtectedRoute>
              }
            />
          ))}
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
