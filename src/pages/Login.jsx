import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";

import { useTheme } from "../context/useTheme";

import {
    Eye,
    EyeOff,
    Moon,
    Sun,
} from "lucide-react";

import "../styles/login.css";

import InputField from "../components/InputField";
import Divider from "../components/Divider";


function Login() {

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const { darkMode, toggleTheme } = useTheme();

    const [formData, setFormData] = useState({
        email: "",
        password: ""
    });


    function handleChange(event) {

        const { name, value } = event.target;

        setFormData({
            ...formData,
            [name]: value
        });
    }


    // =========================
    // NORMAL LOGIN
    // =========================

    async function handleLogin(event) {

        event.preventDefault();
        if (loading) return;

        if (!formData.email || !formData.password) {
            alert("Please enter your email and password.");
            return;
        }


        setLoading(true);
        try {

            // Same-origin API for local development and Vercel.
            const apiUrl = "/api/login";


            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        email: formData.email,
                        password: formData.password
                    })
                }
            );


            const result = await response.json();


            if (result.success) {

                alert("Login successful!");


               localStorage.setItem(
    "user",
    JSON.stringify(result.user)
);

localStorage.setItem("isAuthenticated", "true");

navigate("/dashboard");


            } else {

                alert(result.message);

            }


        } catch (error) {

            console.error(
                "5. LOGIN ERROR:",
                error
            );

            alert(
                "Unable to connect to the server."
            );

        } finally {
            setLoading(false);
        }

    }


    // =========================
    // GOOGLE LOGIN
    // =========================

    async function handleGoogleSuccess(
        credentialResponse
    ) {
        if (loading) return;
        setLoading(true);
        try {
            const apiUrl = "/api/google-login";


            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        credential:
                            credentialResponse.credential
                    })
                }
            );


            const result = await response.json();


            if (result.success) {

    localStorage.setItem(
        "user",
        JSON.stringify(result.user)
    );

    localStorage.setItem("isAuthenticated", "true");

    navigate("/dashboard");

} else {
    alert(result.message);
}


        } catch (error) {

            console.error(
                "GOOGLE LOGIN ERROR:",
                error
            );

            alert(
                "Unable to connect to the server."
            );

        } finally {
            setLoading(false);
        }

    }


    return (

        <div className="login-page">


            {/* =========================
                HEADER
            ========================= */}

            <header className="login-header">

                <div className="brand">

                    <div className="brand-logo">
                        R
                    </div>

                    <span>
                        School Hub
                    </span>

                </div>


                <button
                    className="theme-button"
                    type="button"
                    aria-label="Toggle theme"
                    onClick={toggleTheme}
                >

                    {darkMode
                        ? <Sun size={19} />
                        : <Moon size={19} />
                    }

                </button>

            </header>



            {/* =========================
                LOGIN CONTENT
            ========================= */}

            <main className="login-content">

                <section className="login-section">


                    <h1>
                        School Hub Management Portal
                    </h1>


                    <p className="login-description">

                        Welcome back to our School Hub. Sign in to manage
                        <br />
                        your academic records and class requirements.

                    </p>



                    <form
                        onSubmit={handleLogin}
                    >


                        {/* EMAIL */}

                        <InputField
                            type="email"
                            name="email"
                            placeholder="name@example.com"
                            icon="email"
                            value={formData.email}
                            onChange={handleChange}
                        />



                        {/* PASSWORD */}

                        <div className="password-wrapper">

                            <InputField
                                type={
                                    showPassword
                                        ? "text"
                                        : "password"
                                }
                                name="password"
                                placeholder="Password"
                                icon="lock"
                                value={formData.password}
                                onChange={handleChange}
                            />


                            <button
                                type="button"
                                className="password-toggle"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                onClick={() =>
                                    setShowPassword(
                                        !showPassword
                                    )
                                }
                            >

                                {showPassword ? (
                                    <EyeOff size={18} />
                                ) : (
                                    <Eye size={18} />
                                )}

                            </button>

                        </div>



                        {/* FORGOT PASSWORD */}

                        <div className="forgot-password">

                            <button
                                type="button"
                                onClick={() =>
                                    navigate(
                                        "/forgot-password"
                                    )
                                }
                            >
                                Forgot your password?
                            </button>

                        </div>



                        {/* SIGN IN */}

                        <button
                            className="signin-button"
                            type="submit"
                            disabled={loading}
                            aria-busy={loading}
                        >
                            {loading ? "Signing in…" : "Sign in"}
                        </button>


                    </form>
                        <a href="/support">Need help? Contact support</a>



                    {/* Use Google's visible, accessible button only when configured. */}
                    {import.meta.env.VITE_GOOGLE_CLIENT_ID && <>
                        <Divider />
                        <div className="google-login-wrapper" aria-busy={loading} inert={loading ? true : undefined}>
                            <GoogleLogin
                                locale="en"
                                text="continue_with"
                                theme={darkMode ? "filled_black" : "outline"}
                                size="large"
                                width="300"
                                onSuccess={handleGoogleSuccess}
                                onError={() => alert("Google sign-in failed. Please try again.")}
                            />
                        </div>
                    </>}

                    {/* SIGN UP */}

                    <p className="signup-text">

                        Don't have an account?

                        <button
                            onClick={() =>
                                navigate("/signup")
                            }
                        >
                            Sign Up
                        </button>

                    </p>



                    {/* TERMS */}

                    <p className="terms">

                        By clicking continue, you agree to our{" "}

                        <a href="#">
                            ToS
                        </a>

                        {" "}and{" "}

                        <a href="#">
                            Privacy Policy
                        </a>.

                    </p>


                </section>

            </main>

        </div>

    );

}


export default Login;