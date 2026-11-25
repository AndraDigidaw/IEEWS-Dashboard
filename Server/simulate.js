const SERVER_URL = 'http://localhost:3000/api/sensor'
const INTERVAL = 100
const SAMPLES_PER_LEVEL = 10

const scenarios = [
  { level: 'NORMAL', pga: 0.030 },
  { level: 'ELEVATED', pga: 0.080 },
  { level: 'WARNING', pga: 0.150 },
  { level: 'CRITICAL', pga: 0.250 },
]

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

async function sendReading(scenario, index) {
  const pga = scenario.pga

  // Generate three-axis acceleration
  // Vector magnitude equals the selected PGA
  const x = pga * 0.6
  const y = pga * 0.5
  const z = pga * Math.sqrt(0.39)

  const payload = {
    node_id: 'OUTER_NODE_01',
    x,
    y,
    z,
    pga,
  }

  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    console.log(
      `[${scenario.level}] Sample ${index}/${SAMPLES_PER_LEVEL} | PGA: ${pga.toFixed(3)} g`
    )

  } catch (error) {
    console.error('Failed to send sensor data:', error.message)
    process.exit(1)
  }
}

async function startSimulator() {
  console.log('================================')
  console.log('IEEWS CONTINUOUS SENSOR SIMULATOR')
  console.log(`Interval: ${INTERVAL} ms`)
  console.log('Press Ctrl + C to stop')
  console.log('================================')

  while (true) {
    for (const scenario of scenarios) {
      console.log(`\nStarting ${scenario.level} scenario`)

      for (let i = 1; i <= SAMPLES_PER_LEVEL; i++) {
        await sendReading(scenario, i)
        await delay(INTERVAL)
      }

      // Brief pause between scenarios
      await delay(1000)
    }
  }
}

startSimulator()

