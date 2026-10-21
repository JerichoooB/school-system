<?php

$allowedOrigins = [
    "http://localhost:5173",
    "https://schoolhub.infinityfreeapp.com"
];

$origin = $_SERVER["HTTP_ORIGIN"] ?? "";

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: " . $origin);
}

header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../../vendor/autoload.php";
require_once __DIR__ . "/../config/database.php";

use Google\Auth\AccessToken;


// =========================
// GET DATA
// =========================

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$credential = $data["credential"] ?? "";

if (empty($credential)) {

    echo json_encode([
        "success" => false,
        "message" => "Google credential is required."
    ]);

    exit;
}


try {

    // =========================
    // VERIFY GOOGLE TOKEN
    // =========================

    $auth = new AccessToken();

    $payload = $auth->verify(
        $credential,
        [
            "audience" =>
                "930878075584-tla117755do4gak6s9qqec5agdmqv6kk.apps.googleusercontent.com"
        ]
    );


    if (!$payload) {

        echo json_encode([
            "success" => false,
            "message" => "Invalid Google credential."
        ]);

        exit;
    }


    // =========================
    // GOOGLE USER INFORMATION
    // =========================

    $googleId = $payload["sub"] ?? "";
    $name = $payload["name"] ?? "";
    $email = $payload["email"] ?? "";
    $googleEmailVerified =
        $payload["email_verified"] ?? false;


    if (
        empty($googleId) ||
        empty($email) ||
        !$googleEmailVerified
    ) {

        echo json_encode([
            "success" => false,
            "message" => "Google account information is incomplete."
        ]);

        exit;
    }


    // =========================
    // CHECK GOOGLE ACCOUNT
    // =========================
    //
    // IMPORTANT:
    // Only look for an account whose
    // auth_provider is "google".
    //

    $stmt = $conn->prepare(
        "SELECT
            id,
            name,
            email,
            auth_provider,
            email_verified
         FROM users
         WHERE email = ?
         AND auth_provider = 'google'
         LIMIT 1"
    );

    $stmt->bind_param(
        "s",
        $email
    );

    $stmt->execute();

    $result = $stmt->get_result();


    // =========================
    // EXISTING GOOGLE ACCOUNT
    // =========================

    if ($result->num_rows > 0) {

        $user = $result->fetch_assoc();


        // Google already verified the email,
        // so make sure our database reflects that.

        if ((int)$user["email_verified"] !== 1) {

            $update = $conn->prepare(
                "UPDATE users
                 SET email_verified = 1
                 WHERE id = ?"
            );

            $update->bind_param(
                "i",
                $user["id"]
            );

            $update->execute();

            $update->close();

            $user["email_verified"] = 1;
        }


        echo json_encode([
            "success" => true,
            "message" => "Google login successful.",
            "user" => [
                "id" => $user["id"],
                "name" => $user["name"],
                "email" => $user["email"],
                "auth_provider" => "google",
                "email_verified" => 1
            ]
        ]);

        $stmt->close();
        $conn->close();

        exit;
    }


    // =========================
    // CHECK FOR LOCAL ACCOUNT
    // =========================
    //
    // If the email already belongs
    // to a LOCAL account, don't convert
    // that account into Google.
    //

    $localCheck = $conn->prepare(
        "SELECT
            id,
            name,
            email,
            auth_provider
         FROM users
         WHERE email = ?
         AND auth_provider = 'local'
         LIMIT 1"
    );

    $localCheck->bind_param(
        "s",
        $email
    );

    $localCheck->execute();

    $localResult = $localCheck->get_result();


    if ($localResult->num_rows > 0) {

        echo json_encode([
            "success" => false,
            "message" =>
                "An account with this email already exists as a normal School Hub account. Please sign in using your email and password."
        ]);

        $localCheck->close();
        $stmt->close();
        $conn->close();

        exit;
    }

    $localCheck->close();


    // =========================
    // CREATE NEW GOOGLE ACCOUNT
    // =========================
    //
    // Google accounts don't use the
    // normal School Hub password.
    //

    $randomPassword = password_hash(
        bin2hex(random_bytes(32)),
        PASSWORD_DEFAULT
    );


    $insert = $conn->prepare(
        "INSERT INTO users
        (
            name,
            email,
            password,
            email_verified,
            verification_code,
            verification_expires,
            auth_provider
        )
        VALUES
        (
            ?,
            ?,
            ?,
            1,
            NULL,
            NULL,
            'google'
        )"
    );


    $insert->bind_param(
        "sss",
        $name,
        $email,
        $randomPassword
    );


    if (!$insert->execute()) {

        echo json_encode([
            "success" => false,
            "message" =>
                "Failed to create Google account."
        ]);

        $insert->close();
        $stmt->close();
        $conn->close();

        exit;
    }


    $userId = $insert->insert_id;


    // =========================
    // RETURN NEW GOOGLE USER
    // =========================

    $user = [
        "id" => $userId,
        "name" => $name,
        "email" => $email,
        "auth_provider" => "google",
        "email_verified" => 1
    ];


    echo json_encode([
        "success" => true,
        "message" => "Google account created successfully.",
        "user" => $user
    ]);


    $insert->close();
    $stmt->close();
    $conn->close();


} catch (Throwable $e) {

    echo json_encode([
        "success" => false,
        "message" => "Google login failed.",
        "error" => $e->getMessage()
    ]);

}

?>