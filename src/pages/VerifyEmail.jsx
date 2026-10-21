
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mail } from "lucide-react";

import { useTheme } from "../context/ThemeContext";

import "../styles/signup.css";


function VerifyEmail() {

    const navigate = useNavigate();
    const location = useLocation();

    const { darkMode, toggleTheme } = useTheme();

    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);

    // Email passed from Signup.jsx
    const email = location.state?.email || "";


    async function handleSubmit(event) {

        event.preventDefault();

        if (!email) {

            alert(
                "Email information is missing. Please sign up again."
            );

            navigate("/signup");

            return;
        }


        if (!/^[0-9]{6}$/.test(code)) {

            alert("Please enter the 6-digit verification code.");

            return;
        }


        setLoading(true);


        try {

            const apiUrl = import.meta.env.DEV
                ? "http://localhost/school-system/backend/api/verify-email.php"
                : "/backend/api/verify-email.php";


            console.log("VERIFY EMAIL STARTED");
            console.log("EMAIL:", email);
            console.log("VERIFY API:", apiUrl);


            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        email: email,
                        code: code
                    })
                }
            );


            console.log(
                "VERIFY RESPONSE STATUS:",
                response.status
            );


            const result = await response.json();


            console.log(
                "VERIFY PHP RESPONSE:",
                result
            );


            if (result.success) {

                alert(
                    result.message ||
                    "Email verified successfully."
                );

                navigate("/");

            } else {

                alert(
                    result.message ||
                    "Verification failed."
                );

            }


        } catch (error) {

            console.error(
                "VERIFY EMAIL ERROR:",
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
        <div className="signup-page">


            {/* =========================
                HEADER
            ========================= */}

            <header className="signup-header">

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
                    onClick={toggleTheme}
                    aria-label="Toggle theme"
                >

                    {darkMode ? (
                        <span>☀</span>
                    ) : (
                        <span>☾</span>
                    )}

                </button>

            </header>


            {/* =========================
                CONTENT
            ========================= */}

            <main className="signup-content">

                <section className="signup-section">


                    {/* ICON */}

                    <div
                        style={{
                            width: "58px",
                            height: "58px",
                            margin: "0 auto 20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "15px",
                            background: darkMode
                                ? "#fffffa"
                                : "#101314",
                            color: darkMode
                                ? "#101314"
                                : "#fffffa"
                        }}
                    >

                        <Mail size={25} />

                    </div>


                    {/* HEADING */}

                    <h1>
                        Verify your
                        <br />
                        email
                    </h1>


                    {/* DESCRIPTION */}

                    <p className="signup-description">

                        We sent a 6-digit verification code to

                        <br />

                        <strong>
                            {email || "your email address"}
                        </strong>

                    </p>


                    {/* FORM */}

                    <form onSubmit={handleSubmit}>


                        {/* CODE INPUT */}

                        <div className="signup-input-wrapper">

                            <Mail size={17} />

                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="Enter 6-digit code"
                                value={code}
                                onChange={(event) => {

                                    const value =
                                        event.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 6);

                                    setCode(value);

                                }}
                                required
                            />

                        </div>


                        {/* VERIFY BUTTON */}

                        <button
                            type="submit"
                            className="signup-button"
                            disabled={loading}
                        >

                            {loading
                                ? "Verifying..."
                                : "Verify email"
                            }

                        </button>

                    </form>


                    {/* BACK */}

                    <p className="already-account">

                        Didn't receive the code?

                        <button
                            type="button"
                            onClick={() => navigate("/signup")}
                        >
                            Sign up again
                        </button>

                    </p>


                    {/* LOGIN */}

                    <p className="terms">

                        Already verified?

                        {" "}

                        <button
                            type="button"
                            onClick={() => navigate("/")}
                            style={{
                                border: "none",
                                background: "none",
                                padding: 0,
                                color: darkMode
                                    ? "#fffffa"
                                    : "#101314",
                                textDecoration: "underline",
                                cursor: "pointer",
                                fontSize: "inherit"
                            }}
                        >
                            Sign in
                        </button>

                    </p>


                </section>

            </main>

        </div>
    );
}


export default VerifyEmail;
