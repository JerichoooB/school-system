import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Sun, Moon } from "lucide-react";

import { useTheme } from "../context/useTheme";

import "../styles/login.css";


function ForgotPassword() {

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    // =========================
    // THEME
    // =========================

    const {
        darkMode,
        toggleTheme
    } = useTheme();


    // =========================
    // FORGOT PASSWORD
    // =========================

    async function handleSubmit(event) {
        event.preventDefault();
        if (loading) return;
        if (!email) {
            alert("Please enter your email address.");
            return;
        }
        setLoading(true);
        try {
            const response = await fetch("/api/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const result = await response.json();
            alert(result.message || "Unable to request a password reset.");
            if (result.success) setEmail("");
        } catch {
            alert("Unable to connect to the server. Please try again.");
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


                {/* BRAND */}

                <div className="brand">

                    <div className="brand-logo">
                        R
                    </div>

                    <span>
                        School Hub
                    </span>

                </div>



                {/* =========================
                    DARK MODE TOGGLE
                ========================= */}

                <button
                    className="theme-button"
                    type="button"
                    onClick={toggleTheme}

                    aria-label={
                        darkMode
                            ? "Switch to light mode"
                            : "Switch to dark mode"
                    }
                >

                    {darkMode ? (

                        <Sun size={19} />

                    ) : (

                        <Moon size={19} />

                    )}

                </button>


            </header>



            {/* =========================
                CONTENT
            ========================= */}

            <main className="login-content">

                <section className="login-section">


                    {/* TITLE */}

                    <h1>

                        Forgot your

                        <br />

                        password?

                    </h1>



                    {/* DESCRIPTION */}

                    <p className="login-description">

                        Enter the email address associated with

                        <br />

                        your School Hub account.

                    </p>



                    {/* FORM */}

                    <form
                        onSubmit={handleSubmit}
                    >


                        {/* EMAIL */}

                        <div className="input-wrapper">

                            <span className="input-icon">

                                <Mail size={18} />

                            </span>


                            <input
                                type="email"

                                placeholder="name@example.com"

                                value={email}

                                onChange={(event) =>
                                    setEmail(
                                        event.target.value
                                    )
                                }

                                required
                            />

                        </div>



                        {/* SEND RESET LINK */}

                        <button
                            className="signin-button"

                            type="submit"

                            disabled={loading}
                        >

                            {loading
                                ? "Sending..."
                                : "Send reset link"
                            }

                        </button>


                    </form>



                    {/* =========================
                        BACK TO LOGIN
                    ========================= */}

                    <p className="signup-text">

                        <button
                            type="button"

                            onClick={() =>
                                navigate("/")
                            }
                        >

                            Back to Sign in

                        </button>

                    </p>


                </section>

            </main>


        </div>

    );

}


export default ForgotPassword;