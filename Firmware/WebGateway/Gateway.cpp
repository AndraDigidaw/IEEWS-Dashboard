#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <time.h>

#include "GatewayConfig.h"

namespace {
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr size_t MAX_LINE_BYTES = 512;
constexpr uint32_t MAX_SAMPLE_AGE_MS = 5000;
constexpr uint16_t HTTP_TIMEOUT_MS = 2000;
constexpr const char *SOURCE = BENCH_MODE ? "SIMULATOR" : "HARDWARE";

struct Reading {
  char nodeId[33];
  double x;
  double y;
  double z;
  double pga;
  uint32_t receivedAt;
};

HardwareSerial innerSerial(1);
QueueHandle_t latestReading;
char line[MAX_LINE_BYTES + 1];
size_t lineLength = 0;
bool discardLine = false;
unsigned long invalidFrames = 0;
unsigned long oversizedFrames = 0;

bool parseReading(size_t length, Reading &reading) {
  JsonDocument frame;
  if (deserializeJson(frame, line, length, DeserializationOption::NestingLimit(6))) {
    return false;
  }
  if (!frame["version"].is<int>() || frame["version"].as<int>() != 1 ||
      frame["type"] != "outer_telemetry") {
    return false;
  }

  const JsonString nodeId = frame["node_id"].as<JsonString>();
  if (nodeId.isNull() || nodeId.size() == 0 || nodeId.size() >= sizeof(reading.nodeId)) {
    return false;
  }
  for (size_t i = 0; i < nodeId.size(); ++i) {
    const char ch = nodeId.c_str()[i];
    if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
          (ch >= '0' && ch <= '9') || ch == '_' || ch == '-')) {
      return false;
    }
  }
  memcpy(reading.nodeId, nodeId.c_str(), nodeId.size());

  const JsonObjectConst seismic = frame["seismic"].as<JsonObjectConst>();
  if (!seismic["acc_x_g"].is<double>() || !seismic["acc_y_g"].is<double>() ||
      !seismic["acc_z_g"].is<double>() || !seismic["pga_g"].is<double>()) {
    return false;
  }
  reading.x = seismic["acc_x_g"].as<double>();
  reading.y = seismic["acc_y_g"].as<double>();
  reading.z = seismic["acc_z_g"].as<double>();
  reading.pga = seismic["pga_g"].as<double>();
  return isfinite(reading.x) && fabs(reading.x) <= 16 &&
         isfinite(reading.y) && fabs(reading.y) <= 16 &&
         isfinite(reading.z) && fabs(reading.z) <= 16 &&
         isfinite(reading.pga) && reading.pga >= 0;
}

void consumeByte(char byte) {
  if (byte == '\n') {
    if (!discardLine && lineLength > 0) {
      if (line[lineLength - 1] == '\r') --lineLength;
      Reading reading{};
      if (parseReading(lineLength, reading)) {
        reading.receivedAt = millis();
        xQueueOverwrite(latestReading, &reading);
      } else {
        ++invalidFrames;
      }
    }
    discardLine = false;
    lineLength = 0;
  } else if (!discardLine) {
    if (lineLength == MAX_LINE_BYTES) {
      ++oversizedFrames;
      discardLine = true;
    } else {
      line[lineLength++] = byte;
    }
  }
}

int publishReading(WiFiClient &client, const Reading &reading) {
  JsonDocument payload;
  payload["node_id"] = reading.nodeId;
  payload["x"] = reading.x;
  payload["y"] = reading.y;
  payload["z"] = reading.z;
  payload["pga"] = reading.pga;
  payload["source"] = SOURCE;
  String body;
  serializeJson(payload, body);

  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, SENSOR_URL)) return -1;
  http.addHeader("Content-Type", "application/json");
  if (API_KEY[0]) http.addHeader("x-api-key", API_KEY);
  const int status = http.POST(body);
  http.end();
  return status;
}

void publisher(void *) {
  const bool useTls = strncmp(SENSOR_URL, "https://", 8) == 0;
  WiFiClient plainClient;
  WiFiClientSecure tlsClient;
  if (useTls) {
    tlsClient.setCACert(TLS_ROOT_CA);
    tlsClient.setHandshakeTimeout(3);
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  }
  WiFiClient &client = useTls ? static_cast<WiFiClient &>(tlsClient) : plainClient;
  uint32_t retryDelayMs = 1000;
  unsigned long expired = 0;

  for (;;) {
    if (WiFi.status() != WL_CONNECTED || (useTls && time(nullptr) < 1700000000)) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    Reading reading;
    if (xQueueReceive(latestReading, &reading, pdMS_TO_TICKS(500)) != pdTRUE) continue;
    if (millis() - reading.receivedAt >= MAX_SAMPLE_AGE_MS) {
      Serial.printf("Expired readings: %lu\n", ++expired);
      continue;
    }

    const int status = publishReading(client, reading);
    Serial.printf("POST node=%s source=%s status=%d\n", reading.nodeId, SOURCE, status);
    // Resume with the newest queued reading after backoff. Reposting a timed-out
    // request could duplicate a reading the server already accepted.
    if (status >= 200 && status < 300) {
      retryDelayMs = 1000;
    } else {
      vTaskDelay(pdMS_TO_TICKS(retryDelayMs));
      retryDelayMs = min(retryDelayMs * 2, uint32_t(10000));
    }
  }
}
} // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  const bool useTls = strncmp(SENSOR_URL, "https://", 8) == 0;
  if ((useTls && !TLS_ROOT_CA[0]) ||
      (!useTls && strncmp(SENSOR_URL, "http://", 7) != 0)) {
    Serial.println("Configure an HTTP URL or an HTTPS URL with a trusted CA.");
    return;
  }

  latestReading = xQueueCreate(1, sizeof(Reading));
  if (!latestReading) {
    Serial.println("Could not allocate telemetry queue.");
    return;
  }
  if (!BENCH_MODE) {
    innerSerial.setRxBufferSize(1024);
    // The gateway only receives telemetry. Keep its UART TX disconnected.
    innerSerial.begin(SERIAL_BAUD, SERIAL_8N1, GATEWAY_RX_PIN, -1);
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  if (xTaskCreate(publisher, "telemetry", 8192, nullptr, 1, nullptr) != pdPASS) {
    vQueueDelete(latestReading);
    latestReading = nullptr;
    Serial.println("Could not start telemetry publisher.");
    return;
  }
  Serial.printf("Gateway ready. Input source: %s\n", SOURCE);
}

void loop() {
  if (latestReading) {
    Stream &input = BENCH_MODE ? static_cast<Stream &>(Serial) : static_cast<Stream &>(innerSerial);
    for (size_t i = 0; i < 256; ++i) {
      const int byte = input.read();
      if (byte < 0) break;
      consumeByte(static_cast<char>(byte));
    }
    static uint32_t lastReport = 0;
    if (millis() - lastReport >= 5000) {
      lastReport = millis();
      Serial.printf("Wi-Fi=%s invalid=%lu oversized=%lu\n",
                    WiFi.status() == WL_CONNECTED ? "connected" : "offline",
                    invalidFrames, oversizedFrames);
    }
  }
  delay(1);
}
