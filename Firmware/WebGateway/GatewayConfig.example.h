#pragma once

constexpr char WIFI_SSID[] = "YOUR_WIFI_SSID";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char SENSOR_URL[] = "http://192.168.1.10:3000/api/sensor";
constexpr char API_KEY[] = "";
constexpr char TLS_ROOT_CA[] = ""; // PEM trust anchor for HTTPS.
constexpr bool BENCH_MODE = true; // Read test frames from USB serial.
constexpr int GATEWAY_RX_PIN = 25; // Confirm the wiring before enabling UART.
