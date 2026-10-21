import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Sun, Moon } from "lucide-react";

import { useTheme } from "../context/ThemeContext";

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

        console.log("1. FORGOT PASSWORD STARTED");
        console.log("2. EMAIL:", email);


        if (!email) {

            alert(
                "Please enter your email address."
            );

            return;
        }


        setLoading(true);


        try {

            const formData = new URLSearchParams();

            formData.append(
                "email",
                email
            );


            // =========================
            // LOCAL vs ONLINE API
            // =========================

            const apiUrl = import.meta.env.DEV
                ? "http://localhost/school-system/backend/api/forgot-password.php"
                : "https://schoolhub.infinityfreeapp.com/backend/api/forgot-password.php";


            console.log(
                "3. API URL:",
                apiUrl
            );


            // =========================
            // SEND REQUEST
            // =========================

            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                    },

                    body:
                        formData.toString(),
                }
            );


            console.log(
                "4. RESPONSE STATUS:",
                response.status
            );


            // =========================
            // READ PHP RESPONSE
            // =========================

            const text =
                await response.text();


            console.log(
                "5. RAW PHP RESPONSE:",
                text
            );


            // Remove accidental code fences
            const cleanText = text
                .replace(
                    /^```php\s*/i,
                    ""
                )
                .replace(
                    /^```\s*/i,
                    ""
                )
                .replace(
                    /\s*```$/i,
                    ""
                )
                .trim();


            console.log(
                "6. CLEAN PHP RESPONSE:",
                cleanText
            );


            let data;


            try {

                data =
                    JSON.parse(cleanText);

            } catch (jsonError) {

                console.error(
                    "7. INVALID JSON FROM PHP:",
                    jsonError
                );

                console.error(
                    "PHP RESPONSE WAS:",
                    cleanText
                );


                alert(
                    "The server returned an invalid response. Check the PHP file."
                );

                return;
            }


            console.log(
                "8. PHP RESPONSE:",
                data
            );


            // =========================
            // SUCCESS
            // =========================

            if (data.success) {

                alert(
                    data.message
                );

                setEmail("");

            } else {

                alert(
                    data.message ||
                    "Unable to send password reset email."
                );

            }


        } catch (error) {

            console.error(
                "9. FORGOT PASSWORD ERROR:",
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