<?php

date_default_timezone_set("Asia/Manila");


// =========================
// CORS
// =========================

$allowedOrigins = [
    "http://localhost:5173",
    "https://schoolhub.infinityfreeapp.com"
];

$origin = $_SERVER["HTTP_ORIGIN"] ?? "";

if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: " . $origin);
}

header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");


if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


// =========================
// DATABASE
// =========================

require_once "../config/database.php";


// =========================
// GET JSON DATA
// =========================

$data = json_decode(
    file_get_contents("php://input"),
    true
);


$token =
    trim($data["token"] ?? "");

$password =
    $data["password"] ?? "";


// =========================
// VALIDATION
// =========================

if (
    empty($token) ||
    empty($password)
) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Token and password are required."
    ]);

    exit;
}


// =========================
// PASSWORD LENGTH
// =========================

if (strlen($password) < 8) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Password must be at least 8 characters."
    ]);

    exit;
}


// =========================
// FIND VALID RESET TOKEN
// =========================

$stmt = $conn->prepare(
    "SELECT id
     FROM users
     WHERE reset_token = ?
     AND reset_expires > NOW()
     LIMIT 1"
);


if (!$stmt) {

    echo json_encode([
        "success" => false,
        "message" => "Database error."
    ]);

    $conn->close();

    exit;
}


$stmt->bind_param(
    "s",
    $token
);


$stmt->execute();


$result =
    $stmt->get_result();


if ($result->num_rows === 0) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Invalid or expired reset token."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


$user =
    $result->fetch_assoc();


$stmt->close();


// =========================
// HASH PASSWORD
// =========================

$hashedPassword =
    password_hash(
        $password,
        PASSWORD_DEFAULT
    );


// =========================
// UPDATE PASSWORD
// =========================

$update = $conn->prepare(
    "UPDATE users
     SET password = ?,
         reset_token = NULL,
         reset_expires = NULL
     WHERE id = ?"
);


if (!$update) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Unable to update password."
    ]);

    $conn->close();

    exit;
}


$update->bind_param(
    "si",
    $hashedPassword,
    $user["id"]
);


if (!$update->execute()) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Unable to update password."
    ]);

    $update->close();
    $conn->close();

    exit;
}


$update->close();


// =========================
// SUCCESS
// =========================

echo json_encode([
    "success" => true,
    "message" =>
        "Password successfully changed."
]);


$conn->close();

?>