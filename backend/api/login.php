<?php

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once "../config/database.php";


// =========================
// GET LOGIN DATA
// =========================

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$email = trim($data["email"] ?? "");
$password = $data["password"] ?? "";


// =========================
// VALIDATION
// =========================

if (empty($email) || empty($password)) {

    echo json_encode([
        "success" => false,
        "message" => "Email and password are required."
    ]);

    exit;
}


// =========================
// FIND LOCAL ACCOUNT
// =========================
//
// IMPORTANT:
// Only search for LOCAL accounts.
//
// Google accounts must use Google Sign-In.
//

$sql = "SELECT id, name, email, password, auth_provider, email_verified
        FROM users
        WHERE email = ?
        LIMIT 1";

$stmt = $conn->prepare($sql);

if (!$stmt) {

    echo json_encode([
        "success" => false,
        "message" => "SQL prepare failed."
    ]);

    exit;
}

$stmt->bind_param(
    "s",
    $email
);

$stmt->execute();

$result = $stmt->get_result();


// =========================
// ACCOUNT NOT FOUND
// =========================

if ($result->num_rows === 0) {

    echo json_encode([
        "success" => false,
        "message" => "Invalid email or password."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


$user = $result->fetch_assoc();


// =========================
// GOOGLE ACCOUNT
// =========================

// ==========================================
// CHECK AUTH PROVIDER
// ==========================================

if ($user["auth_provider"] === "google") {

    echo json_encode([
        "success" => false,
        "message" => "This email is associated with a Google account. Please use Continue with Google."
    ]);

    exit;
}


// =========================
// EMAIL VERIFICATION
// =========================
//
// Normal/local accounts must verify
// their email before logging in.
//

if ((int)$user["email_verified"] !== 1) {

    echo json_encode([
        "success" => false,
        "message" => "Please verify your email address before signing in.",
        "requires_verification" => true,
        "email" => $user["email"]
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// PASSWORD CHECK
// =========================

if (!password_verify(
    $password,
    $user["password"]
)) {

    echo json_encode([
        "success" => false,
        "message" => "Invalid email or password."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// LOGIN SUCCESS
// =========================

echo json_encode([
    "success" => true,
    "message" => "Login successful.",
    "user" => [
        "id" => $user["id"],
        "name" => $user["name"],
        "email" => $user["email"],
        "auth_provider" => "local",
        "email_verified" => 1
    ]
]);


$stmt->close();
$conn->close();

?>