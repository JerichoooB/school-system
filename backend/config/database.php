<?php

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "school_system"
);

if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}

$conn->set_charset("utf8mb4");