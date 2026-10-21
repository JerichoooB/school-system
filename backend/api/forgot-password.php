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
// PHPMailer
// =========================

require_once "../PHPMailer/src/Exception.php";
require_once "../PHPMailer/src/PHPMailer.php";
require_once "../PHPMailer/src/SMTP.php";

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;


// =========================
// GET EMAIL
// =========================

$email = $_POST["email"] ?? "";

$email = trim($email);


// =========================
// VALIDATION
// =========================

if (empty($email)) {

    echo json_encode([
        "success" => false,
        "message" => "Email is required."
    ]);

    exit;
}


if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {

    echo json_encode([
        "success" => false,
        "message" => "Please enter a valid email address."
    ]);

    exit;
}


// =========================
// FIND USER
// =========================

$stmt = $conn->prepare(
    "SELECT id, name, email
     FROM users
     WHERE email = ?
     LIMIT 1"
);

if (!$stmt) {

    echo json_encode([
        "success" => false,
        "message" => "Database error."
    ]);

    exit;
}

$stmt->bind_param("s", $email);

$stmt->execute();

$result = $stmt->get_result();


if ($result->num_rows === 0) {

    echo json_encode([
        "success" => false,
        "message" => "No account was found with that email."
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


$user = $result->fetch_assoc();

$stmt->close();


// =========================
// GENERATE RESET TOKEN
// =========================

$token = bin2hex(
    random_bytes(32)
);


// =========================
// TOKEN EXPIRATION
// 1 HOUR
// =========================

$expires = date(
    "Y-m-d H:i:s",
    time() + (60 * 60)
);


// =========================
// SAVE TOKEN
// =========================

$update = $conn->prepare(
    "UPDATE users
     SET reset_token = ?,
         reset_expires = ?
     WHERE id = ?"
);

if (!$update) {

    echo json_encode([
        "success" => false,
        "message" => "Database error."
    ]);

    $conn->close();

    exit;
}


$update->bind_param(
    "ssi",
    $token,
    $expires,
    $user["id"]
);


if (!$update->execute()) {

    echo json_encode([
        "success" => false,
        "message" => "Unable to create password reset request."
    ]);

    $update->close();
    $conn->close();

    exit;
}

$update->close();


// ======================================================
// DETERMINE LOCAL OR ONLINE
// ======================================================

$host = $_SERVER["HTTP_HOST"] ?? "";


// LOCAL
if (
    strpos($host, "localhost") !== false ||
    strpos($host, "127.0.0.1") !== false
) {

    $resetBaseUrl =
        "http://localhost:5173/reset-password";

}


// ONLINE
else {

    $resetBaseUrl =
        "https://schoolhub.infinityfreeapp.com/reset-password";

}


// =========================
// FINAL RESET LINK
// =========================

$resetLink =
    $resetBaseUrl .
    "?token=" .
    urlencode($token);


// =========================
// CREATE MAIL
// =========================

$mail = new PHPMailer(true);


try {

    // =========================
    // SMTP
    // =========================

    $mail->isSMTP();

    $mail->Host = "smtp.gmail.com";

    $mail->SMTPAuth = true;


    // =========================
    // GMAIL ACCOUNT
    // =========================

    $mail->Username =
        "jerichobalayog000@gmail.com";


    // =========================
    // GMAIL APP PASSWORD
    //
    // CHANGE THIS LATER IF NEEDED
    // =========================

    $mail->Password =
        "clolkyrhdoncwdvk";


    $mail->SMTPSecure =
        PHPMailer::ENCRYPTION_STARTTLS;

    $mail->Port = 587;


    // =========================
    // SENDER
    // =========================

    $mail->setFrom(
        "jerichobalayog000@gmail.com",
        "School Hub"
    );


    // =========================
    // RECIPIENT
    // =========================

    $mail->addAddress(
        $user["email"],
        $user["name"]
    );


    // =========================
    // EMAIL FORMAT
    // =========================

    $mail->isHTML(true);

    $mail->Subject =
        "School Hub - Password Reset";


    // =========================
    // SAFE USER NAME
    // =========================

    $safeName =
        htmlspecialchars(
            $user["name"],
            ENT_QUOTES,
            "UTF-8"
        );


    // =========================
    // EMAIL BODY
    // =========================

    $mail->Body = "

        <div style='
            font-family: Arial, sans-serif;
            max-width: 500px;
            margin: auto;
            padding: 20px;
        '>

            <h2>
                Reset your School Hub password
            </h2>

            <p>
                Hello {$safeName},
            </p>

            <p>
                We received a request to reset
                your School Hub password.
            </p>

            <p>
                Click the button below to create
                a new password.
            </p>

            <p style='margin: 30px 0;'>

                <a
                    href='{$resetLink}'
                    style='
                        background: #101314;
                        color: #FFFFFA;
                        padding: 12px 20px;
                        text-decoration: none;
                        border-radius: 6px;
                        display: inline-block;
                    '
                >
                    Reset Password
                </a>

            </p>

            <p>
                This link will expire in
                <strong>1 hour</strong>.
            </p>

            <p>
                If you did not request a password
                reset, you can safely ignore this email.
            </p>

            <p>
                — School Hub
            </p>

        </div>

    ";


    // =========================
    // PLAIN TEXT VERSION
    // =========================

    $mail->AltBody =
        "Hello {$user["name"]},\n\n"
        . "We received a request to reset your "
        . "School Hub password.\n\n"
        . "Use this link to reset your password:\n\n"
        . $resetLink
        . "\n\n"
        . "This link will expire in 1 hour.\n\n"
        . "— School Hub";


    // =========================
    // SEND
    // =========================

    $mail->send();


    // =========================
    // SUCCESS
    // =========================

    echo json_encode([
        "success" => true,
        "message" =>
            "Password reset link has been sent to your email."
    ]);


} catch (Exception $e) {

    // =========================
    // CLEAR TOKEN IF EMAIL FAILS
    // =========================

    $clear = $conn->prepare(
        "UPDATE users
         SET reset_token = NULL,
             reset_expires = NULL
         WHERE id = ?"
    );

    if ($clear) {

        $clear->bind_param(
            "i",
            $user["id"]
        );

        $clear->execute();

        $clear->close();
    }


    echo json_encode([
        "success" => false,
        "message" => "Unable to send reset email.",
        "error" => $mail->ErrorInfo
    ]);
}


$conn->close();

?>