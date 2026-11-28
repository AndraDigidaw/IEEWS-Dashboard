# ESP32 Web Gateway

The gateway forwards version 1 Outer Node telemetry to the existing Express sensor endpoint. The backend broadcasts accepted readings to the dashboard over WebSocket.

## LAN bench test

1. From the repository root, install dependencies with `npm ci` using Node.js 22.13+ or Node.js 24. Start the backend with `node Server/server.js` and the dashboard with `npm run dev` in another terminal. Use a local backend for bench traffic because the API exposes one latest reading.
2. Copy `GatewayConfig.example.h` to `GatewayConfig.h`, enter your Wi-Fi settings and replace the example IP in `SENSOR_URL` with the backend computer's LAN IP. If the backend has `IEEWS_TOKEN` set, put the matching value in `API_KEY`. The local config is ignored by Git. Open this directory as a PlatformIO project and select the `gateway` environment. For Arduino IDE, open `WebGateway.ino` and select ESP32 Dev Module with the Arduino-ESP32 3.x package and ArduinoJson 7 library.
3. Leave `BENCH_MODE = true`, upload the sketch and open Serial Monitor at 115200 baud with the **New Line** ending. Once Wi-Fi is connected, send this single line.

```json
{"version":1,"type":"outer_telemetry","node_id":"GATEWAY_BENCH","seismic":{"acc_x_g":0.012,"acc_y_g":-0.008,"acc_z_g":0.003,"pga_g":0.015}}
```

4. Check for `POST node=GATEWAY_BENCH source=SIMULATOR status=200`. Open `http://localhost:3000/api/sensor` on the backend computer and compare the node ID, source and readings with the submitted frame. Open the Vite dashboard on the backend computer and check that the alert panel shows `SIMULATOR` as the sample source.
5. Send a frame with missing PGA, a truncated line followed by a newline, or a line longer than 512 bytes. Check that the rejection counters advance and then send another valid line. To check recovery, stop the backend, send a frame, wait over five seconds, restart the backend and send a fresh frame.

If a different computer runs Vite, set `VITE_WS_URL=ws://<backend-LAN-IP>:3000` in its local Vite environment. Use HTTPS and WSS for a hosted deployment. Configure `TLS_ROOT_CA` with the endpoint's trusted PEM root certificate for HTTPS and allow the ESP32 to synchronize its clock via NTP.

## Inner Node UART integration

Confirm the Inner firmware emits the frame above and verify both boards' GPIO allocations before setting `BENCH_MODE = false`. Connect the confirmed Inner TX to the configured Gateway RX and connect common GND. Use 3.3 V UART, 115200 baud, 8N1 and leave Gateway TX unwired. GPIO25 is the example Gateway RX. The Inner TX pin is board-specific.

The inspected Inner firmware uses GPIO26 for the siren relay and GPIO25 for audio. Its current LoRa packet codec handles heartbeat, event and test messages. Three-axis readings appear in local console CSV but are absent from those radio packets. A live Outer-to-Inner telemetry sender and a verified unused Inner TX pin are needed before enabling live forwarding.

Send one compact JSON object per LF-terminated line, up to 512 bytes before LF. The `node_id` allows 1–32 ASCII letters, digits, hyphens and underscores. The three acceleration fields must be JSON numbers within ±16 g. `pga_g` is required and must be a finite, nonnegative, gravity-compensated PGA value supplied by the sensing firmware. The gateway maps these four measurements to `x`, `y`, `z` and `pga` in `POST /api/sensor`. UART mode uses `source: "HARDWARE"`. This phase forwards routine telemetry. Inner Node status, alert events and output commands require a separate interface.

The receiver keeps the newest pending reading while the HTTP task runs. A newer frame replaces the pending one. Readings older than five seconds at publish time are discarded and failures trigger backoff capped at ten seconds. If a request times out, the gateway resumes with fresh telemetry because the server may already have received the timed-out request. The API timestamp records backend receipt time.
