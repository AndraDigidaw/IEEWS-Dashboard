// IEEWS realistic earthquake simulator
// Run: node simulator-quake.js   (backend must already be running)

const SERVER_URL = 'http://localhost:3000/api/sensor'
const INTERVAL = 40 // ms between samples (25 Hz)

// Peak amplitude of the S-wave in g. Pass it from the terminal: node simulator-quake.js 0.15
const PEAK_AMPLITUDE = Number(process.argv[2]) || 0.5

// Timeline in seconds
const IDLE_BEFORE = 10 // quiet background
const P_WAVE = 4 // weak, fast first arrival
const S_RISE = 3 // S-wave builds up
const S_DECAY = 14 // S-wave dies away
const IDLE_AFTER = 8 // quiet again before the next quake

const CYCLE = IDLE_BEFORE + P_WAVE + S_RISE + S_DECAY + IDLE_AFTER

// Axis weights (vector magnitude of the weights is about 1)
const WX = 0.6
const WY = 0.5
const WZ = Math.sqrt(0.39)

const noise = (amp) => (Math.random() * 2 - 1) * amp
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Returns { amp, freq } for the time t (seconds) inside the cycle.
function envelope(t) {
  const pStart = IDLE_BEFORE
  const sStart = pStart + P_WAVE
  const sPeak = sStart + S_RISE
  const sEnd = sPeak + S_DECAY

  if (t < pStart) return { amp: 0, freq: 3.5 }

  if (t < sStart) {
    // P-wave: small and fast
    return { amp: PEAK_AMPLITUDE * 0.15, freq: 8 }
  }

  if (t < sPeak) {
    // S-wave builds up
    const k = (t - sStart) / S_RISE
    return { amp: PEAK_AMPLITUDE * k, freq: 5 }
  }

  if (t < sEnd) {
    // S-wave decays exponentially
    const k = (t - sPeak) / S_DECAY
    return { amp: PEAK_AMPLITUDE * Math.exp(-4 * k), freq: 3.5 }
  }

  return { amp: 0, freq: 3.5 }
}

async function sendSample(x, y, z) {
  const pga = Math.sqrt(x * x + y * y + z * z)

  const payload = {
    node_id: 'OUTER_NODE_01',
    source: 'SIMULATOR',
    timestamp: new Date().toISOString(),
    x,
    y,
    z,
    pga,
  }

  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error(`HTTP error: ${response.status}`)
    }
  } catch (error) {
    // Keep running so the dashboard can recover when the backend returns.
    console.error('Could not reach backend:', error.message)
  }

  return pga
}

async function start() {
  console.log('IEEWS realistic earthquake simulator')
  console.log(`Peak S-wave amplitude: ${PEAK_AMPLITUDE} g`)
  console.log('Press Ctrl + C to stop\n')

  const startTime = Date.now()
  let lastLog = 0

  while (true) {
    const elapsed = (Date.now() - startTime) / 1000
    const t = elapsed % CYCLE
    const env = envelope(t)
    const freq = env.freq
    const amp = env.amp * (0.75 + Math.random() * 0.5)

    // Each axis oscillates with its own phase, plus a little sensor noise.
    const base = 0.004
    const x = WX * amp * Math.sin(2 * Math.PI * freq * elapsed) + noise(base)
    const y =
      WY * amp * Math.sin(2 * Math.PI * freq * 1.1 * elapsed + 1.3) +
      noise(base)
    const z =
      WZ * amp * Math.sin(2 * Math.PI * freq * 0.9 * elapsed + 2.1) +
      noise(base)

    const pga = await sendSample(x, y, z)

    if (elapsed - lastLog >= 1) {
      lastLog = elapsed
      console.log(`t=${t.toFixed(0).padStart(2)}s  PGA=${pga.toFixed(3)} g`)
    }

    await delay(INTERVAL)
  }
}

start()
