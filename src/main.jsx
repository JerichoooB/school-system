import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";

import "./index.css";
import App from "./App.jsx";

const googleClientId =
    "930878075584-tla117755do4gak6s9qqec5agdmqv6kk.apps.googleusercontent.com";

    

createRoot(document.getElementById("root")).render(
  <GoogleOAuthProvider
    clientId={googleClientId}
    locale="en"
>
    <App />
</GoogleOAuthProvider>
);