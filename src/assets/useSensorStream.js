import { useState, useEffect, useRef } from 'react'

const WS_URL =
  import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3000`
const MAX_POINTS = 750
const MAX_BACKOFF_MS = 10000

const emptyHistory = () => ({
  labels: Array(MAX_POINTS).fill(''),
  x: Array(MAX_POINTS).fill(0),
  y: Array(MAX_POINTS).fill(0),
  z: Array(MAX_POINTS).fill(0),
})

export default function useSensorStream(onReading) {
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING')
  const [history, setHistory] = useState(emptyHistory)

  // Always call the latest callback without restarting the socket.
  const onReadingRef = useRef(onReading)
  useEffect(() => {
    onReadingRef.current = onReading
  }, [onReading])

  useEffect(() => {
    // Prevent Mixed Content SecurityError when hosted over HTTPS without a WSS endpoint
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      WS_URL.startsWith('ws://')
    ) {
      setConnectionStatus('SIMULATED')
      return
    }

    let ws
    let retryTimer
    let attempt = 0
    let closedByUs = false

    const connect = () => {
      setConnectionStatus(attempt === 0 ? 'CONNECTING' : 'RECONNECTING')

      try {
        ws = new WebSocket(WS_URL)
      } catch (error) {
        console.warn('WebSocket initialization skipped:', error)
        setConnectionStatus('SIMULATED')
        return
      }

      ws.onopen = () => {
        attempt = 0
        setConnectionStatus('CONNECTED')
      }

      ws.onmessage = (message) => {
        try {
          const packet = JSON.parse(message.data)
          if (packet.type !== 'SENSOR_DATA') return

          const r = packet.data
          const x = Number(r.x)
          const y = Number(r.y)
          const z = Number(r.z)
          const pga = Number(r.pga)
          if (![x, y, z, pga].every(Number.isFinite)) return

          const ts = r.timestamp ? new Date(r.timestamp) : new Date()
          const time = Number.isNaN(ts.getTime())
            ? new Date().toLocaleTimeString()
            : ts.toLocaleTimeString()

          setHistory((prev) => ({
            labels: [...prev.labels.slice(1), time],
            x: [...prev.x.slice(1), x],
            y: [...prev.y.slice(1), y],
            z: [...prev.z.slice(1), z],
          }))

          onReadingRef.current?.({
            node_id: r.node_id,
            x,
            y,
            z,
            pga,
            time,
          })
        } catch (error) {
          console.error('Invalid WebSocket message:', error)
        }
      }

      ws.onerror = () => {
        // onclose fires right after and schedules the retry.
      }

      ws.onclose = () => {
        if (closedByUs) return
        setConnectionStatus('DISCONNECTED')
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
        attempt += 1
        retryTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closedByUs = true
      clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])

  return { history, connectionStatus }
}