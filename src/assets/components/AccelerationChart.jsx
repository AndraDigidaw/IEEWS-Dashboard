import { useState } from 'react'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js'

import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const STATUS_COLORS = {
  CONNECTED: '#4ade80',
  CONNECTING: '#fbbf24',
  RECONNECTING: '#fbbf24',
  DISCONNECTED: '#f87171',
}

const CHANNELS = [
  { key: 'combined', label: 'Combined' },
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'z', label: 'Z' },
]

// Drum-recorder look: red ink on light grid paper.
const PAPER_COLOR = '#f8fafc'
const INK_COLOR = '#b91c1c'
const GRID_COLOR = '#cbd5e1'
const AXIS_TEXT = '#475569'

// The vertical range grows in steps so strong shaking is never cut off.
const Y_STEPS = [0.4, 0.8, 1.2, 2, 3, 5, 10, 20]

const buildOptions = (limit) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { intersect: false, mode: 'index' },

  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${Number(ctx.parsed.y).toFixed(3)} g`,
      },
    },
  },

  scales: {
    x: {
      ticks: { color: AXIS_TEXT, maxTicksLimit: 8, maxRotation: 0 },
      grid: { color: GRID_COLOR },
    },
    y: {
      min: -limit,
      max: limit,
      title: {
        display: true,
        text: 'Acceleration (g)',
        color: AXIS_TEXT,
      },
      ticks: { color: AXIS_TEXT, maxTicksLimit: 9 },
      grid: {
        // The zero line is the paper's resting line.
        color: (ctx) => (ctx.tick.value === 0 ? '#64748b' : GRID_COLOR),
      },
    },
  },
})

function AccelerationChart({ history, connectionStatus = 'CONNECTING' }) {
  const [channel, setChannel] = useState('combined')

  if (!history) return null

  // Combined = resultant magnitude of X, Y, Z (the same value the alert
  // uses). The sign follows the axis with the strongest motion, so the
  // trace still swings above and below the resting line like a seismograph.
  const series =
    channel === 'combined'
      ? history.x.map((x, i) => {
          const y = history.y[i]
          const z = history.z[i]
          const magnitude = Math.sqrt(x * x + y * y + z * z)
          const dominant =
            Math.abs(x) >= Math.abs(y) && Math.abs(x) >= Math.abs(z)
              ? x
              : Math.abs(y) >= Math.abs(z)
                ? y
                : z
          return dominant < 0 ? -magnitude : magnitude
        })
      : history[channel]

  // Pick the smallest range that fits the strongest sample on screen.
  const peak = series.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
  const limit =
    Y_STEPS.find((step) => peak * 1.05 <= step) || Math.ceil(peak * 1.1)

  const data = {
    labels: history.labels,
    datasets: [
      {
        data: series,
        borderColor: INK_COLOR,
        borderWidth: 1.2,
        pointRadius: 0,
        tension: 0, // sharp zigzag, like a pen on paper
      },
    ],
  }

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            color: STATUS_COLORS[connectionStatus] || '#fbbf24',
          }}
        >
          ● WEBSOCKET: {connectionStatus}
        </span>

        <div style={{ display: 'flex', gap: '6px' }}>
          {CHANNELS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setChannel(item.key)}
              aria-pressed={channel === item.key}
              style={{
                padding: '3px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '5px',
                cursor: 'pointer',
                border: '1px solid #334155',
                background: channel === item.key ? INK_COLOR : 'transparent',
                color: channel === item.key ? '#fff' : '#94a3b8',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          height: '230px',
          width: '100%',
          background: PAPER_COLOR,
          borderRadius: '8px',
          padding: '8px 10px 4px',
        }}
      >
        <Line data={data} options={buildOptions(limit)} />
      </div>
    </div>
  )
}

export default AccelerationChart

