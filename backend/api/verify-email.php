<?php

date_default_timezone_set("Asia/Manila");

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once "../config/database.php";


// =========================
// GET DATA
// =========================

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$email = trim($data["email"] ?? "");
$code = trim($data["code"] ?? "");


// =========================
// VALIDATION
// =========================

if (empty($email) || empty($code)) {

    echo json_encode([
        "success" => false,
        "message" => "Email and verification code are required."
    ]);

    exit;
}


// Make sure the code is exactly 6 digits

if (!preg_match("/^[0-9]{6}$/", $code)) {

    echo json_encode([
        "success" => false,
        "message" => "Verification code must be 6 digits."
    ]);

    exit;
}


// =========================
// FIND USER
// =========================

$stmt = $conn->prepare(
    "SELECT
        id,
        name,
        email,
        email_verified,
        verification_code,
        verification_expires,
        auth_provider
     FROM users
     WHERE email = ?
     LIMIT 1"
);

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
// USER NOT FOUND
// =========================

if ($result->num_rows === 0) {

    echo json_encode([
        "success" => false,
        "message" => "Account not found."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


$user = $result->fetch_assoc();


// =========================
// GOOGLE ACCOUNT CHECK
// =========================
//
// Google accounts do not use the
// School Hub verification code.
//

if ($user["auth_provider"] === "google") {

    echo json_encode([
        "success" => false,
        "message" => "Google accounts do not require email verification."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// ALREADY VERIFIED
// =========================

if ((int)$user["email_verified"] === 1) {

    echo json_encode([
        "success" => true,
        "message" => "Your email is already verified."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// CHECK VERIFICATION CODE
// =========================

if (
    empty($user["verification_code"]) ||
    $user["verification_code"] !== $code
) {

    echo json_encode([
        "success" => false,
        "message" => "Invalid verification code."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// CHECK EXPIRATION
// =========================

if (
    empty($user["verification_expires"]) ||
    strtotime($user["verification_expires"]) < time()
) {

    echo json_encode([
        "success" => false,
        "message" => "Verification code has expired. Please request a new code."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// VERIFY EMAIL
// =========================

$update = $conn->prepare(
    "UPDATE users
     SET
        email_verified = 1,
        verification_code = NULL,
        verification_expires = NULL
     WHERE id = ?"
);

if (!$update) {

    echo json_encode([
        "success" => false,
        "message" => "Unable to verify email."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}

$update->bind_param(
    "i",
    $user["id"]
);


if (!$update->execute()) {

    echo json_encode([
        "success" => false,
        "message" => "Unable to verify email."
    ]);

    $update->close();
    $stmt->close();
    $conn->close();

    exit;
}


// =========================
// SUCCESS
// =========================

echo json_encode([
    "success" => true,
    "message" => "Email verified successfully.",
    "user" => [
        "id" => $user["id"],
        "name" => $user["name"],
        "email" => $user["email"],
        "auth_provider" => "local",
        "email_verified" => 1
    ]
]);


$update->close();
$stmt->close();
$conn->close();

?>