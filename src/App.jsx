import { BrowserRouter, Routes, Route } from "react-router-dom";

import Support from "./pages/Support";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";



import ProtectedRoute from "./components/ProtectedRoute";

import { ThemeProvider } from "./context/ThemeContext";


function App() {
    return (
        <ThemeProvider>

            <BrowserRouter>

                <Routes>
                    <Route path="/support" element={<Support />} />

                    <Route
                        path="/"
                        element={<Login />}
                    />

                    <Route
                        path="/signup"
                        element={<Signup />}
                    />

                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />

                    <Route
                    path="/forgot-password"
                    element={<ForgotPassword />}
                />

                    

                <Route
    path="/reset-password"
    element={<ResetPassword />}
/>

                </Routes>

            </BrowserRouter>

        </ThemeProvider>
    );
}

export default App;