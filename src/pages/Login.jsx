import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";

import { useTheme } from "../context/ThemeContext";

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

        console.log("1. LOGIN STARTED");

        if (!formData.email || !formData.password) {
            alert("Please enter your email and password.");
            return;
        }

        console.log("2. SENDING LOGIN:", {
            email: formData.email
        });


        try {

            // LOCAL vs ONLINE API
            const apiUrl = import.meta.env.DEV
                ? "http://localhost/school-system/backend/api/login.php"
                : "https://schoolhub.infinityfreeapp.com/backend/api/login.php";


            console.log("LOGIN API URL:", apiUrl);


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


            console.log(
                "3. RESPONSE STATUS:",
                response.status
            );


            const result = await response.json();


            console.log(
                "4. PHP RESPONSE:",
                result
            );


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

        }

    }


    // =========================
    // GOOGLE LOGIN
    // =========================

    async function handleGoogleSuccess(
        credentialResponse
    ) {

        console.log(
            "GOOGLE LOGIN SUCCESS"
        );

        console.log(
            "GOOGLE CREDENTIAL RECEIVED"
        );


        try {

            // LOCAL vs ONLINE API
            const apiUrl = import.meta.env.DEV
                ? "http://localhost/school-system/backend/api/google-login.php"
                : "/backend/api/google-login.php";


            console.log(
                "GOOGLE API URL:",
                apiUrl
            );


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


            console.log(
                "GOOGLE PHP RESPONSE STATUS:",
                response.status
            );


            const result = await response.json();


            console.log(
                "GOOGLE PHP SUCCESS:",
                result.success
            );

            console.log(
                "GOOGLE PHP MESSAGE:",
                result.message
            );

            console.log(
                "GOOGLE PHP USER:",
                result.user
            );


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
                        >
                            Sign in
                        </button>


                    </form>



                    {/* GOOGLE */}

                    <Divider />


                    <div className="google-login-wrapper">

                        {/* YOUR VISUAL BUTTON */}

                        <div className="custom-google-button">

                            <div className="google-logo">
                                G
                            </div>

                            <span>
                                Continue with Google
                            </span>

                        </div>


                        {/* GOOGLE AUTHENTICATION BUTTON */}

                        <div className="google-auth-overlay">

                            <GoogleLogin
                                locale="en"
                                text="continue_with"
                                width="430"
                                onSuccess={
                                    handleGoogleSuccess
                                }
                                onError={() => {

                                    console.error(
                                        "GOOGLE LOGIN FAILED"
                                    );

                                    alert(
                                        "Google sign-in failed."
                                    );

                                }}
                            />

                        </div>

                    </div>



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