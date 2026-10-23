import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
    Eye,
    EyeOff,
    Lock,
    Sun,
    Moon
} from "lucide-react";

import { useTheme } from "../context/useTheme";

import "../styles/login.css";


function ResetPassword() {

    const [searchParams] = useSearchParams();

    const token = searchParams.get("token");


    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");


    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);


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
    // RESET PASSWORD
    // =========================

    async function handleSubmit(event) {

        event.preventDefault();



        // =========================
        // TOKEN VALIDATION
        // =========================

        if (!token) {

            alert(
                "Invalid or missing reset token."
            );

            return;
        }



        // =========================
        // PASSWORD VALIDATION
        // =========================

        if (password.length < 8) {

            alert(
                "Password must be at least 8 characters."
            );

            return;
        }


        if (password !== confirmPassword) {

            alert(
                "Passwords do not match."
            );

            return;
        }



        setLoading(true);



        try {



            // =========================
            // LOCAL vs ONLINE API
            // =========================

            const apiUrl = "/api/reset-password";



            // =========================
            // SEND REQUEST
            // =========================

            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                    },

                    body: JSON.stringify({

                        token: token,

                        password: password,

                    }),
                }
            );



            // =========================
            // READ RESPONSE
            // =========================

            const text =
                await response.text();



            const data =
                JSON.parse(text);



            // =========================
            // SUCCESS
            // =========================

            if (data.success) {

                alert(
                    "Password successfully changed!"
                );


                navigate("/");


            } else {

                alert(
                    data.message
                );

            }



        } catch (error) {

            console.error(
                "7. RESET PASSWORD ERROR:",
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


                    {/* =========================
                        TITLE
                    ========================= */}

                    <h1>

                        Reset your

                        <br />

                        password

                    </h1>



                    {/* =========================
                        DESCRIPTION
                    ========================= */}

                    <p className="login-description">

                        Enter a new password for your

                        <br />

                        School Hub account.

                    </p>



                    {/* =========================
                        FORM
                    ========================= */}

                    <form
                        onSubmit={handleSubmit}
                    >



                        {/* =========================
                            NEW PASSWORD
                        ========================= */}

                        <div className="password-wrapper">


                            <div className="input-wrapper">


                                <span className="input-icon">

                                    <Lock size={18} />

                                </span>



                                <input
                                    type={
                                        showPassword
                                            ? "text"
                                            : "password"
                                    }

                                    placeholder="New password"

                                    value={password}

                                    onChange={(event) =>
                                        setPassword(
                                            event.target.value
                                        )
                                    }

                                    required
                                />


                            </div>



                            <button
                                type="button"

                                className="password-toggle"

                                onClick={() =>
                                    setShowPassword(
                                        !showPassword
                                    )
                                }

                                aria-label={
                                    showPassword
                                        ? "Hide password"
                                        : "Show password"
                                }
                            >

                                {showPassword ? (

                                    <EyeOff size={18} />

                                ) : (

                                    <Eye size={18} />

                                )}

                            </button>


                        </div>



                        {/* =========================
                            PASSWORD HINT
                        ========================= */}

                        <p
                            className="password-hint"

                            style={{
                                textAlign: "left",
                            }}
                        >

                            Password must be at least 8
                            characters.

                        </p>



                        {/* =========================
                            CONFIRM PASSWORD
                        ========================= */}

                        <div className="password-wrapper">


                            <div className="input-wrapper">


                                <span className="input-icon">

                                    <Lock size={18} />

                                </span>



                                <input
                                    type={
                                        showConfirmPassword
                                            ? "text"
                                            : "password"
                                    }

                                    placeholder="Confirm new password"

                                    value={confirmPassword}

                                    onChange={(event) =>
                                        setConfirmPassword(
                                            event.target.value
                                        )
                                    }

                                    required
                                />


                            </div>



                            <button
                                type="button"

                                className="password-toggle"

                                onClick={() =>
                                    setShowConfirmPassword(
                                        !showConfirmPassword
                                    )
                                }

                                aria-label={
                                    showConfirmPassword
                                        ? "Hide confirm password"
                                        : "Show confirm password"
                                }
                            >

                                {showConfirmPassword ? (

                                    <EyeOff size={18} />

                                ) : (

                                    <Eye size={18} />

                                )}

                            </button>


                        </div>



                        {/* =========================
                            RESET BUTTON
                        ========================= */}

                        <button
                            className="signin-button"

                            type="submit"

                            disabled={loading}
                        >

                            {loading
                                ? "Resetting..."
                                : "Reset password"
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


export default ResetPassword;