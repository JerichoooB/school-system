
import { useState } from "react";
import {
    Eye,
    EyeOff,
    User,
    Mail,
    Lock,
    Moon,
    Sun
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useTheme } from "../context/useTheme";

import "../styles/signup.css";

function Signup() {

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Controls whether the verification form is shown
    const [verificationMode, setVerificationMode] = useState(false);

    const [verificationCode, setVerificationCode] = useState("");

    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);

    const navigate = useNavigate();

    const { darkMode, toggleTheme } = useTheme();


    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: ""
    });


    function handleChange(event) {

        const { name, value } = event.target;

        setFormData({
            ...formData,
            [name]: value
        });
    }


    // ==========================================
    // REGISTER ACCOUNT
    // ==========================================

    async function handleSubmit(event) {

        event.preventDefault();


        // PASSWORD MATCH

        if (formData.password !== formData.confirmPassword) {

            alert("Passwords do not match.");

            return;
        }


        // PASSWORD LENGTH

        if (formData.password.length < 8) {

            alert("Password must be at least 8 characters.");

            return;
        }


        const fullName =
            `${formData.firstName} ${formData.lastName}`;


        setLoading(true);


        try {


            const apiUrl = "/api/register";


            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        name: fullName,
                        email: formData.email,
                        password: formData.password
                    })
                }
            );


            const result = await response.json();


            // ==========================================
            // REGISTRATION SUCCESS
            // ==========================================

            if (result.success) {


                // Show verification form
                // on the same Signup page.
                setVerificationMode(true);

                alert(
                    "Verification code sent to your email."
                );

                return;
            }


            if (response.status === 409) setVerificationMode(true);

            // ==========================================
            // REGISTRATION FAILED
            // ==========================================

            alert(
                result.message ||
                "Unable to create your account."
            );


        } catch (error) {

            console.error(
                "11. FETCH ERROR:",
                error
            );

            alert(
                "Unable to connect to the server."
            );

        } finally {

            setLoading(false);

        }
    }


    // ==========================================
    // VERIFY EMAIL
    // ==========================================

    async function handleVerifyEmail(event) {

        event.preventDefault();


        if (!verificationCode) {

            alert(
                "Please enter your verification code."
            );

            return;
        }


        if (verificationCode.length !== 6) {

            alert(
                "Verification code must be 6 digits."
            );

            return;
        }


        setVerifying(true);


        try {

            const apiUrl = "/api/verify-email";


            const response = await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        email: formData.email,
                        code: verificationCode
                    })
                }
            );


            const result = await response.json();


            if (result.success) {

                alert(
                    "Email verified successfully! You can now sign in."
                );


                // Return to login page
                navigate("/");

            } else {

                alert(
                    result.message ||
                    "Invalid verification code."
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

            setVerifying(false);

        }
    }


    // ==========================================
    // RESEND VERIFICATION CODE
    // ==========================================




    async function handleResendCode() {
        setVerifying(true);
        try {
            const response = await fetch('/api/resend-verification', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email }),
            });
            const result = await response.json();
            alert(result.message);
        } catch { alert('Unable to request a new code. Please try again.'); }
        finally { setVerifying(false); }
    }

    return (

        <div className="signup-page">


            {/* HEADER */}

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
                        <Sun size={19} />
                    ) : (
                        <Moon size={19} />
                    )}

                </button>

            </header>


            {/* CONTENT */}

            <main className="signup-content">

                <section className="signup-section">


                    {!verificationMode ? (

                        <>
                            {/* ==========================================
                                SIGN UP
                            ========================================== */}

                            <h1>
                                Create your
                                <br />
                                account
                            </h1>


                            <p className="signup-description">
                                Create your School Hub account to access
                                <br />
                                your academic records and class requirements.
                            </p>


                            <form onSubmit={handleSubmit}>


                                {/* FIRST AND LAST NAME */}

                                <div className="name-row">


                                    <div className="signup-input-wrapper">

                                        <User size={17} />

                                        <input
                                            type="text"
                                            name="firstName"
                                            placeholder="First name"
                                            value={formData.firstName}
                                            onChange={handleChange}
                                            required
                                        />

                                    </div>


                                    <div className="signup-input-wrapper">

                                        <User size={17} />

                                        <input
                                            type="text"
                                            name="lastName"
                                            placeholder="Last name"
                                            value={formData.lastName}
                                            onChange={handleChange}
                                            required
                                        />

                                    </div>

                                </div>


                                {/* EMAIL */}

                                <div className="signup-input-wrapper">

                                    <Mail size={17} />

                                    <input
                                        type="email"
                                        name="email"
                                        placeholder="name@example.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                    />

                                </div>


                                {/* PASSWORD */}

                                <div className="signup-input-wrapper">

                                    <Lock size={17} />

                                    <input
                                        type={
                                            showPassword
                                                ? "text"
                                                : "password"
                                        }
                                        name="password"
                                        placeholder="Password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                    />


                                    <button
                                        type="button"
                                        className="signup-password-toggle"
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
                                            <EyeOff size={17} />
                                        ) : (
                                            <Eye size={17} />
                                        )}

                                    </button>

                                </div>


                                {/* CONFIRM PASSWORD */}

                                <div className="signup-input-wrapper">

                                    <Lock size={17} />

                                    <input
                                        type={
                                            showConfirmPassword
                                                ? "text"
                                                : "password"
                                        }
                                        name="confirmPassword"
                                        placeholder="Confirm password"
                                        value={
                                            formData.confirmPassword
                                        }
                                        onChange={handleChange}
                                        required
                                    />


                                    <button
                                        type="button"
                                        className="signup-password-toggle"
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
                                            <EyeOff size={17} />
                                        ) : (
                                            <Eye size={17} />
                                        )}

                                    </button>

                                </div>


                                {/* PASSWORD HINT */}

                                <p className="password-hint">
                                    Password must be at least 8 characters.
                                </p>


                                {/* CREATE ACCOUNT */}

                                <button
                                    type="submit"
                                    className="signup-button"
                                    disabled={loading}
                                >

                                    {loading
                                        ? "Creating account..."
                                        : "Create account"
                                    }

                                </button>

                            </form>


                            {/* LOGIN */}

                            <p className="already-account">

                                Already have an account?

                                <button
                                    type="button"
                                    onClick={() => navigate("/")}
                                >
                                    Sign In
                                </button>

                            </p>


                            {/* TERMS */}

                            <p className="terms">

                                By creating an account, you agree to our{" "}

                                <a href="#">
                                    ToS
                                </a>

                                {" "}and{" "}

                                <a href="#">
                                    Privacy Policy
                                </a>.

                            </p>

                        </>

                    ) : (

                        <>
                            {/* ==========================================
                                EMAIL VERIFICATION
                            ========================================== */}

                            <h1>
                                Verify your
                                <br />
                                email
                            </h1>


                            <p className="signup-description">

                                We sent a 6-digit verification code to
                                <br />

                                <strong>
                                    {formData.email}
                                </strong>

                            </p>


                            <form
                                onSubmit={handleVerifyEmail}
                            >


                                {/* VERIFICATION CODE */}

                                <div className="signup-input-wrapper">

                                    <Mail size={17} />

                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="Enter 6-digit code"
                                        value={verificationCode}
                                        onChange={(event) =>
                                            setVerificationCode(
                                                event.target.value
                                                    .replace(/\D/g, "")
                                            )
                                        }
                                        required
                                    />

                                </div>


                                {/* VERIFY BUTTON */}

                                <button
                                    type="submit"
                                    className="signup-button"
                                    disabled={verifying}
                                >

                                    {verifying
                                        ? "Verifying..."
                                        : "Verify email"
                                    }

                                </button>


                            </form>


                            <button type="button" disabled={verifying} onClick={handleResendCode}>Resend verification code</button>
                            {/* BACK TO SIGN IN */}

                            <p className="already-account">

                                Already verified?

                                <button
                                    type="button"
                                    onClick={() => navigate("/")}
                                >
                                    Sign In
                                </button>

                            </p>


                            <p className="terms">

                                Check your inbox and enter the
                                6-digit code sent by School Hub.

                            </p>

                        </>

                    )}

                </section>

            </main>

        </div>
    );
}

export default Signup;

