
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

// PHPMailer
require_once "../PHPMailer/src/Exception.php";
require_once "../PHPMailer/src/PHPMailer.php";
require_once "../PHPMailer/src/SMTP.php";

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;


// =========================
// GET DATA
// =========================

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$name = trim($data["name"] ?? "");
$email = trim($data["email"] ?? "");
$password = $data["password"] ?? "";


// =========================
// VALIDATION
// =========================

if (empty($name) || empty($email) || empty($password)) {

    echo json_encode([
        "success" => false,
        "message" => "All fields are required."
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


if (strlen($password) < 8) {

    echo json_encode([
        "success" => false,
        "message" => "Password must be at least 8 characters."
    ]);

    exit;
}


// =========================
// CHECK EXISTING EMAIL
// =========================

$check = $conn->prepare(
    "SELECT id, email_verified, auth_provider
     FROM users
     WHERE email = ?
     LIMIT 1"
);

$check->bind_param("s", $email);
$check->execute();

$result = $check->get_result();


if ($result->num_rows > 0) {

    $existingUser = $result->fetch_assoc();

    // ==========================================
    // GOOGLE ACCOUNT
    // ==========================================

    if ($existingUser["auth_provider"] === "google") {

        echo json_encode([
            "success" => false,
            "message" => "This email is already associated with a Google account. Please use Continue with Google."
        ]);

        exit;
    }


    // ==========================================
    // LOCAL ACCOUNT ALREADY VERIFIED
    // ==========================================

    if (
        $existingUser["auth_provider"] === "local" &&
        (int)$existingUser["email_verified"] === 1
    ) {

        echo json_encode([
            "success" => false,
            "message" => "An account with this email already exists. Please sign in instead."
        ]);

        exit;
    }


    // ==========================================
    // LOCAL ACCOUNT NOT VERIFIED
    // ==========================================

    $userId = $existingUser["id"];

} else {

    $userId = null;
}


// =========================
// HASH PASSWORD
// =========================

$hashedPassword = password_hash(
    $password,
    PASSWORD_DEFAULT
);


// =========================
// GENERATE 6-DIGIT CODE
// =========================

$verificationCode = str_pad(
    (string)random_int(0, 999999),
    6,
    "0",
    STR_PAD_LEFT
);


// Code expires in 10 minutes
$verificationExpires = date(
    "Y-m-d H:i:s",
    time() + (10 * 60)
);


// =========================
// CREATE / UPDATE USER
// =========================

if ($userId === null) {

    $sql = "INSERT INTO users
            (
                name,
                email,
                password,
                email_verified,
                verification_code,
                verification_expires
            )
            VALUES (?, ?, ?, 0, ?, ?)";

    $stmt = $conn->prepare($sql);

    if (!$stmt) {

        echo json_encode([
            "success" => false,
            "message" => "SQL prepare failed: " . $conn->error
        ]);

        exit;
    }

    $stmt->bind_param(
        "sssss",
        $name,
        $email,
        $hashedPassword,
        $verificationCode,
        $verificationExpires
    );

} else {

    $sql = "UPDATE users
            SET
                name = ?,
                password = ?,
                email_verified = 0,
                verification_code = ?,
                verification_expires = ?
            WHERE id = ?";

    $stmt = $conn->prepare($sql);

    if (!$stmt) {

        echo json_encode([
            "success" => false,
            "message" => "SQL prepare failed: " . $conn->error
        ]);

        exit;
    }

    $stmt->bind_param(
        "ssssi",
        $name,
        $hashedPassword,
        $verificationCode,
        $verificationExpires,
        $userId
    );
}


// =========================
// SAVE USER
// =========================

if (!$stmt->execute()) {

    echo json_encode([
        "success" => false,
        "message" => "Registration failed: " . $stmt->error
    ]);

    exit;
}

$stmt->close();


// =========================
// SEND VERIFICATION EMAIL
// =========================

$mail = new PHPMailer(true);

try {

    $mail->isSMTP();

    $mail->Host = "smtp.gmail.com";
    $mail->SMTPAuth = true;

    /*
     * YOUR GMAIL ADDRESS
     */
    $mail->Username = "jerichobalayog000@gmail.com";

    /*
     * YOUR NEW GMAIL APP PASSWORD
     *
     * DO NOT USE YOUR NORMAL GMAIL PASSWORD.
     */
    $mail->Password = "clolkyrhdoncwdvk";

    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
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
        $email,
        $name
    );


    // =========================
    // EMAIL
    // =========================

    $mail->isHTML(true);

    $mail->Subject = "School Hub - Email Verification";


    $mail->Body = "
        <div style='
            font-family: Arial, sans-serif;
            max-width: 500px;
            margin: auto;
            padding: 20px;
        '>

            <h2>Verify your School Hub account</h2>

            <p>
                Hello " . htmlspecialchars($name) . ",
            </p>

            <p>
                Thank you for creating your School Hub account.
                Use the verification code below to verify your email address:
            </p>

            <div style='
                background: #101314;
                color: #FFFFFA;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                text-align: center;
                padding: 20px;
                margin: 30px 0;
                border-radius: 8px;
            '>
                {$verificationCode}
            </div>

            <p>
                This verification code will expire in
                <strong>10 minutes</strong>.
            </p>

            <p>
                If you did not create a School Hub account,
                you can safely ignore this email.
            </p>

            <p>
                — School Hub
            </p>

        </div>
    ";


    $mail->AltBody =
        "Hello {$name},\n\n"
        . "Your School Hub verification code is: "
        . $verificationCode
        . "\n\n"
        . "This code will expire in 10 minutes.\n\n"
        . "— School Hub";


    $mail->send();


    // =========================
    // SUCCESS
    // =========================

    echo json_encode([
        "success" => true,
        "message" => "Verification code sent to your email."
    ]);


} catch (Exception $e) {

    // If email fails, remove the newly created verification data.
    $clear = $conn->prepare(
        "UPDATE users
         SET verification_code = NULL,
             verification_expires = NULL
         WHERE email = ?"
    );

    $clear->bind_param("s", $email);
    $clear->execute();
    $clear->close();


    echo json_encode([
        "success" => false,
        "message" => "Unable to send verification email.",
        "error" => $mail->ErrorInfo
    ]);
}


$conn->close();

?>

