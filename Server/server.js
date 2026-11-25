import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'

const app = express()
const server = createServer(app)

const PORT = 3000

// Optional shared secret. If IEEWS_TOKEN is set, every POST must send it
// in the "x-api-key" header. Leave it unset while testing with the simulator.
//   Run with:  IEEWS_TOKEN=rahasia123 node server/server.js
const API_TOKEN = process.env.IEEWS_TOKEN || ''

// Reject impossible values (ADXL345 max range is +-16 g).
const MAX_ABS_G = 16

// Middleware
app.use(cors())
app.use(express.json())

// WebSocket server
const wss = new WebSocketServer({ server })

// Latest sensor reading
let latestReading = null

// Packet counter, printed every 5 seconds to help debug the hardware link
let packetsSinceLastLog = 0
let lastNodeId = '-'

setInterval(() => {
  if (packetsSinceLastLog > 0) {
    console.log(
      `[${new Date().toLocaleTimeString()}] ${packetsSinceLastLog} packets in 5s from ${lastNodeId}`
    )
    packetsSinceLastLog = 0
  }
}, 5000)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'IEEWS Backend is running',
    timestamp: new Date().toISOString(),
  })
})

// Receive sensor data
app.post('/api/sensor', (req, res) => {
  if (API_TOKEN && req.get('x-api-key') !== API_TOKEN) {
    return res.status(401).json({
      status: 'ERROR',
      message: 'Unauthorized',
    })
  }

  const { node_id, x, y, z, pga, source } = req.body ?? {}

  const xValue = Number(x)
  const yValue = Number(y)
  const zValue = Number(z)

  const axesValid = [x, y, z].every(
    (value) => value !== undefined && value !== null && value !== ''
  ) && [xValue, yValue, zValue].every(
    (value) => Number.isFinite(value) && Math.abs(value) <= MAX_ABS_G
  )

  if (!node_id || !axesValid) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'Invalid sensor data',
    })
  }

  // The ESP may omit "pga" to keep the LoRa packet small.
  // If it is missing or invalid, compute it from the three axes.
  const suppliedPga = Number(pga)
  const hasValidPga =
    pga !== undefined &&
    pga !== null &&
    pga !== '' &&
    Number.isFinite(suppliedPga) &&
    suppliedPga >= 0

  latestReading = {
    node_id,
    source: source || 'HARDWARE',
    x: xValue,
    y: yValue,
    z: zValue,
    pga: hasValidPga
      ? suppliedPga
      : Math.sqrt(xValue * xValue + yValue * yValue + zValue * zValue),
    timestamp: new Date().toISOString(),
  }

  packetsSinceLastLog += 1
  lastNodeId = node_id

  // Broadcast to connected dashboard clients
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'SENSOR_DATA',
        data: latestReading,
      }))
    }
  })

  res.json({
    status: 'SUCCESS',
    message: 'Sensor data received',
    data: latestReading,
  })
})

// Get latest sensor reading
app.get('/api/sensor', (req, res) => {
  res.json({
    status: 'OK',
    data: latestReading,
  })
})

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('Dashboard connected via WebSocket')

  if (latestReading) {
    ws.send(JSON.stringify({
      type: 'SENSOR_DATA',
      data: latestReading,
    }))
  }

  ws.on('close', () => {
    console.log('Dashboard disconnected')
  })
})

// Start backend
server.listen(PORT, '0.0.0.0', () => {
  console.log('================================')
  console.log('IEEWS BACKEND RUNNING')
  console.log(`HTTP:      http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}`)
  console.log(API_TOKEN ? 'API token: ENABLED' : 'API token: disabled')
  console.log('================================')
})
