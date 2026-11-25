import ieewsLogo from "./assets/ieews-logo-symbol.png";
import { useState, useCallback, useRef } from 'react'
import './App.css'
import AccelerationChart from './assets/components/AccelerationChart'
import SimulationTestMode from './SimulationTestMode'
import SeismicMap from './assets/components/SeismicMap'
import useSensorStream from './assets/useSensorStream'

const ALERT_LEVELS = {
  NORMAL: {
    level: 'NORMAL',
    title: 'NO ALERT',
    message: 'No significant seismic activity detected.',
    icon: '✓',
  },
  ELEVATED: {
    level: 'ELEVATED',
    title: 'ELEVATED ACTIVITY',
    message: 'Increased ground acceleration detected.',
    icon: '!',
  },
  WARNING: {
    level: 'WARNING',
    title: 'EARTHQUAKE WARNING',
    message: 'Significant ground acceleration detected.',
    icon: '!',
  },
  CRITICAL: {
    level: 'CRITICAL',
    title: 'CRITICAL ALERT',
    message: 'Critical acceleration threshold exceeded.',
    icon: '!!',
  },
}

const THRESHOLDS = {
  elevated: 0.05,
  warning: 0.10,
  critical: 0.20,
}

const REQUIRED_SAMPLES = 5

const DEFAULT_SETTINGS = {
  systemName: 'IEEWS',
  projectName: 'Integrated Earthquake Early Warning System',
  location: 'Not configured',
  elevated: '0.05',
  warning: '0.10',
  critical: '0.20',
  samplingInterval: '100',
  sensor: 'ADXL345',
  measurementUnit: 'g',
  loraModel: 'E220',
  loraRole: 'UART communication',
  networkType: 'Wi-Fi',
  networkMode: 'Local hotspot',
}

const menuItems = [
  { label: 'Overview', icon: '⌂' },
  { label: 'Seismic Monitoring', icon: '⌁' },
  { label: 'Seismic Map', icon: '⌖' },
  { label: 'Node Status', icon: '▣' },
  { label: 'Event History', icon: '◷' },
]

const formatValue = (value) => Number(value || 0).toFixed(3)

// ESTIMATED MMI (USGS PGA-to-intensity ranges, PGA in g)
const MMI_SCALE = [
  { max: 0.0017, mmi: 'I', label: 'Not felt' },
  { max: 0.014, mmi: 'II–III', label: 'Weak' },
  { max: 0.039, mmi: 'IV', label: 'Light' },
  { max: 0.092, mmi: 'V', label: 'Moderate' },
  { max: 0.18, mmi: 'VI', label: 'Strong' },
  { max: 0.34, mmi: 'VII', label: 'Very strong' },
  { max: 0.65, mmi: 'VIII', label: 'Severe' },
  { max: 1.24, mmi: 'IX', label: 'Violent' },
  { max: Infinity, mmi: 'X+', label: 'Extreme' },
]

const estimateMmi = (pga) => {
  const value = Number.isFinite(Number(pga)) ? Number(pga) : 0
  return MMI_SCALE.find((row) => value < row.max)
}

// ALERT CLASSIFICATION
const determineAlertLevel = (pga) => {
  if (pga >= THRESHOLDS.critical) return 'CRITICAL'
  if (pga >= THRESHOLDS.warning) return 'WARNING'
  if (pga >= THRESHOLDS.elevated) return 'ELEVATED'
  return 'NORMAL'
}

function App() {
  const [activePage, setActivePage] = useState('Overview')

  // SENSOR DATA
  const [sensorReading, setSensorReading] = useState({
    node_id: undefined,
    x: 0,
    y: 0,
    z: 0,
    pga: 0,
    peakPga: 0,
    time: '--:--:--',
  })

  // ALERT STATE
  const [alertState, setAlertState] = useState(ALERT_LEVELS.NORMAL)

  const pendingAlert = useRef({
    level: 'NORMAL',
    count: 0,
  })

  const currentAlertLevel = useRef('NORMAL')

  // Tracks an alert transition while consecutive samples are being confirmed.
  const [pendingAlertInfo, setPendingAlertInfo] = useState(null)

  // EVENT HISTORY
  const [events, setEvents] = useState([])
  const [eventFilter, setEventFilter] = useState('ALL')
  const [eventSearch, setEventSearch] = useState('')

  // SYSTEM SETTINGS (frontend prototype)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const updateSetting = (field, value) => {
    setSettings((previous) => ({ ...previous, [field]: value }))
    setSettingsSaved(false)
  }

  const saveSettings = () => {
    const elevated = Number(settings.elevated)
    const warning = Number(settings.warning)
    const critical = Number(settings.critical)

    if (
      !Number.isFinite(elevated) ||
      !Number.isFinite(warning) ||
      !Number.isFinite(critical) ||
      elevated < 0 ||
      warning <= elevated ||
      critical <= warning
    ) {
      window.alert(
        'Invalid PGA thresholds. Make sure 0 ≤ Elevated < Warning < Critical.'
      )
      return
    }

    // Apply the edited thresholds to the running dashboard session.
    THRESHOLDS.elevated = elevated
    THRESHOLDS.warning = warning
    THRESHOLDS.critical = critical
    setSettingsSaved(true)
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    THRESHOLDS.elevated = Number(DEFAULT_SETTINGS.elevated)
    THRESHOLDS.warning = Number(DEFAULT_SETTINGS.warning)
    THRESHOLDS.critical = Number(DEFAULT_SETTINGS.critical)
    setSettingsSaved(false)
  }

  const addEvent = useCallback((level, pga, source = 'SIMULATION') => {
    const event = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleString(),
      level,
      pga: Number(pga),
      source,
    }

    setEvents((previous) => [event, ...previous])
  }, [])

  // LIVE SENSOR DATA (called by useSensorStream for every packet)
  const handleDataUpdate = useCallback(
    (reading) => {
      // Normalize incoming sensor values and reject invalid PGA values.
      const xValue = Number(reading?.x)
      const yValue = Number(reading?.y)
      const zValue = Number(reading?.z)

      const x = Number.isFinite(xValue) ? xValue : 0
      const y = Number.isFinite(yValue) ? yValue : 0
      const z = Number.isFinite(zValue) ? zValue : 0

      const suppliedPga = Number(reading?.pga)
      const hasValidPga =
        reading?.pga !== undefined &&
        reading?.pga !== null &&
        reading?.pga !== '' &&
        Number.isFinite(suppliedPga) &&
        suppliedPga >= 0

      const pga = hasValidPga
        ? suppliedPga
        : Math.sqrt(x * x + y * y + z * z)

      // Update the latest reading independently from the confirmed alert state.
      setSensorReading((previous) => ({
        node_id: reading?.node_id ?? previous.node_id,
        x,
        y,
        z,
        pga,
        peakPga: Math.max(previous.peakPga, pga),
        time: reading?.time || new Date().toLocaleTimeString(),
      }))

      const detectedLevel = determineAlertLevel(pga)
      const confirmedLevel = currentAlertLevel.current

      // If the reading returns to the confirmed level, cancel any pending transition.
      if (detectedLevel === confirmedLevel) {
        pendingAlert.current = {
          level: confirmedLevel,
          count: 0,
        }
        setPendingAlertInfo(null)
        return
      }

      // Count consecutive samples that agree on the new candidate level.
      if (pendingAlert.current.level === detectedLevel) {
        pendingAlert.current.count += 1
      } else {
        pendingAlert.current = {
          level: detectedLevel,
          count: 1,
        }
      }

      const sampleCount = pendingAlert.current.count

      setPendingAlertInfo({
        from: confirmedLevel,
        to: detectedLevel,
        count: sampleCount,
        required: REQUIRED_SAMPLES,
      })

      // Confirm both alert escalation and recovery after consecutive samples.
      if (sampleCount >= REQUIRED_SAMPLES) {
        currentAlertLevel.current = detectedLevel
        setAlertState(ALERT_LEVELS[detectedLevel])

        addEvent(detectedLevel, pga, 'LIVE SENSOR')

        pendingAlert.current = {
          level: detectedLevel,
          count: 0,
        }
        setPendingAlertInfo(null)
      }
    },
    [addEvent]
  )

  // WEBSOCKET CONNECTION (runs on every page, not only the chart pages)
  const { history, connectionStatus } = useSensorStream(handleDataUpdate)

  // SIMULATION INTEGRATION
  const handleSimulationTest = useCallback(
    (scenario) => {
      const pga = Number(scenario?.pga)

      if (!Number.isFinite(pga) || pga < 0) {
        window.alert('Invalid simulation PGA value.')
        return
      }

      const reading = {
        x: pga * 0.6,
        y: pga * 0.5,
        z: pga * Math.sqrt(0.39),
        pga,
        time: new Date().toLocaleTimeString(),
      }

      setSensorReading((previous) => ({
        ...previous,
        ...reading,
        peakPga: Math.max(previous.peakPga, pga),
      }))

      const detectedLevel = determineAlertLevel(pga)

      // Simulation tests apply immediately; live readings use sample confirmation.
      currentAlertLevel.current = detectedLevel

      pendingAlert.current = {
        level: detectedLevel,
        count: 0,
      }

      setPendingAlertInfo(null)
      setAlertState(ALERT_LEVELS[detectedLevel])

      addEvent(detectedLevel, pga, 'SIMULATION')
    },
    [addEvent]
  )

  // SHARED ALERT PANEL
  const earthquakeAlertPanel = (
    <div className="panel alert-panel">
      <div className="panel-header">
        <div>
          <h3>Earthquake Alert</h3>
          <p>Current system condition</p>
        </div>
        <span className="live-tag">● LIVE</span>
      </div>

      <div
        className={`alert-normal alert-${alertState.level.toLowerCase()}`}
        role="status"
        aria-live={
          alertState.level === 'WARNING' || alertState.level === 'CRITICAL'
            ? 'assertive'
            : 'polite'
        }
      >
        <div className="alert-icon">{alertState.icon}</div>
        <h2>{alertState.title}</h2>
        <p>{alertState.message}</p>
        <small>Current PGA: {formatValue(sensorReading.pga)} g</small>

        {pendingAlertInfo && (
          <small className="alert-pending-info">
            {pendingAlertInfo.to === 'NORMAL'
              ? 'Recovery'
              : 'Alert transition'} pending: {pendingAlertInfo.count}/{pendingAlertInfo.required} consecutive samples
            ({pendingAlertInfo.from} → {pendingAlertInfo.to})
          </small>
        )}
      </div>
    </div>
  )

  const monitoringChart = (
    <AccelerationChart history={history} connectionStatus={connectionStatus} />
  )

  // EVENT HISTORY PAGE
  const filteredEvents = events.filter((event) => {
    const matchesFilter =
      eventFilter === 'ALL' || event.level === eventFilter

    const search = eventSearch.toLowerCase()
    const matchesSearch =
      event.level.toLowerCase().includes(search) ||
      event.source.toLowerCase().includes(search) ||
      event.timestamp.toLowerCase().includes(search)

    return matchesFilter && matchesSearch
  })

  const eventHistoryPage = (
    <>
      <div className="welcome">
        <div>
          <h2>Event History</h2>
          <p>Historical earthquake detection records</p>
        </div>
        <span className="demo-tag">DEMO DATA</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p>TOTAL EVENTS</p>
          <h2>{events.length}</h2>
          <small>Recorded detection events</small>
        </div>

        <div className="stat-card">
          <p>WARNING EVENTS</p>
          <h2>{events.filter((e) => e.level === 'WARNING').length}</h2>
          <small>Significant seismic activity</small>
        </div>

        <div className="stat-card">
          <p>CRITICAL EVENTS</p>
          <h2>{events.filter((e) => e.level === 'CRITICAL').length}</h2>
          <small>Critical acceleration events</small>
        </div>

        <div className="stat-card">
          <p>HIGHEST RECORDED PGA</p>
          <h2>
            {events.length
              ? formatValue(Math.max(...events.map((e) => e.pga)))
              : '0.000'}
            <span> g</span>
          </h2>
          <small>Maximum recorded event</small>
        </div>
      </div>

      <div className="panel history-panel">
        <div className="panel-header">
          <div>
            <h3>Detection Records</h3>
            <p>Complete seismic event log</p>
          </div>

          <button
            className="history-clear-button"
            onClick={() => {
              if (window.confirm('Clear all event history?')) {
                setEvents([])
              }
            }}
          >
            Clear History
          </button>
        </div>

        <div className="history-controls">
          <input
            type="text"
            placeholder="Search events..."
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
          />

          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="ALL">All Levels</option>
            <option value="NORMAL">Normal</option>
            <option value="ELEVATED">Elevated</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <div className="event-table-wrapper">
          <table className="event-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Alert Level</th>
                <th>PGA</th>
                <th>Source</th>
              </tr>
            </thead>

            <tbody>
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.timestamp}</td>
                    <td>
                      <span className={`event-badge ${event.level.toLowerCase()}`}>
                        {event.level}
                      </span>
                    </td>
                    <td>{formatValue(event.pga)} g</td>
                    <td>{event.source}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="event-empty">
                    No event records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="history-footer">
          Showing {filteredEvents.length} of {events.length} events
        </div>
      </div>
    </>
  )

  // NODE STATUS PAGE
  const nodeStatusPage = (
    <>
      <div className="welcome">
        <div>
          <h2>Node Status</h2>
          <p>Monitoring communication and hardware conditions</p>
        </div>
        <span className="demo-tag">SIMULATED STATUS</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p>OUTER NODE</p>
          <h2 className="online">DEMO ONLINE</h2>
          <small>Transmitter · ESP32</small>
        </div>

        <div className="stat-card">
          <p>INNER NODE</p>
          <h2 className="online">DEMO ONLINE</h2>
          <small>Receiver · ESP32</small>
        </div>

        <div className="stat-card">
          <p>COMMUNICATION</p>
          <h2>LoRa E220</h2>
          <small>Outer to Inner Node</small>
        </div>

        <div className="stat-card">
          <p>NETWORK</p>
          <h2>Wi-Fi</h2>
          <small>Inner Node to Dashboard</small>
        </div>
      </div>

      <div className="node-grid">
        <div className="panel node-card">
          <div className="panel-header">
            <div>
              <h3>Outer Node</h3>
              <p>Seismic sensor transmitter</p>
            </div>
            <span className="event-badge normal">DEMO</span>
          </div>

          <div className="node-details">
            <div><span>Microcontroller</span><strong>ESP32</strong></div>
            <div><span>Accelerometer</span><strong>ADXL345</strong></div>
            <div><span>Communication</span><strong>LoRa E220 TX</strong></div>
            <div><span>Power Source</span><strong>Solar + Battery</strong></div>
            <div><span>Battery Voltage</span><strong>Awaiting hardware</strong></div>
            <div><span>Last Transmission</span><strong>Awaiting hardware</strong></div>
          </div>
        </div>

        <div className="panel node-card">
          <div className="panel-header">
            <div>
              <h3>Inner Node</h3>
              <p>Receiver and gateway</p>
            </div>
            <span className="event-badge normal">DEMO</span>
          </div>

          <div className="node-details">
            <div><span>Microcontroller</span><strong>ESP32</strong></div>
            <div><span>Communication</span><strong>LoRa E220 RX</strong></div>
            <div><span>Network</span><strong>Wi-Fi</strong></div>
            <div><span>Backend Connection</span><strong>{connectionStatus}</strong></div>
            <div><span>Battery Voltage</span><strong>Awaiting hardware</strong></div>
            <div><span>Last Received Packet</span><strong>{sensorReading.time}</strong></div>
          </div>
        </div>
      </div>

      <div className="panel history-panel">
        <div className="panel-header">
          <div>
            <h3>Communication Architecture</h3>
            <p>IEEWS wireless communication path</p>
          </div>
        </div>

        <div className="communication-flow">
          <div className="flow-node">
            <strong>OUTER NODE</strong>
            <small>ESP32 + ADXL345</small>
          </div>

          <div className="flow-link">
            <span>LoRa E220</span>
            <div>→</div>
          </div>

          <div className="flow-node">
            <strong>INNER NODE</strong>
            <small>ESP32 Receiver</small>
          </div>

          <div className="flow-link">
            <span>Wi-Fi</span>
            <div>→</div>
          </div>

          <div className="flow-node">
            <strong>DASHBOARD</strong>
            <small>Node.js + React</small>
          </div>
        </div>
      </div>
    </>
  )

  // PAGE RENDERING
  const renderPage = () => {
    switch (activePage) {
      case 'Overview':
        return (
          <>
            <div className="welcome">
              <div>
                <h2>Seismic Monitoring Dashboard</h2>
                <p>Real-time earthquake detection and monitoring</p>
              </div>
              <span className="demo-tag">DEMO DATA</span>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <p>PEAK GROUND ACCELERATION</p>
                <h2>{formatValue(sensorReading.peakPga)} <span>g</span></h2>
                <small>Maximum resultant reading</small>
              </div>

              <div className="stat-card">
                <p>ESTIMATED MMI</p>
                <h2>{estimateMmi(sensorReading.peakPga).mmi}</h2>
                <small>
                  {estimateMmi(sensorReading.peakPga).label} shaking · from peak PGA
                </small>
              </div>

              <div className="stat-card">
                <p>OUTER NODE</p>
                <h2 className="online">DEMO ONLINE</h2>
                <small>Simulated node status</small>
              </div>

              <div className="stat-card">
                <p>INNER NODE</p>
                <h2 className="online">DEMO ONLINE</h2>
                <small>Simulated node status</small>
              </div>
            </div>

            <div className="monitoring-grid">
              <div className="panel acceleration-panel">
                <div className="panel-header">
                  <div>
                    <h3>Acceleration Monitoring</h3>
                    <p>Three-axis sensor measurements</p>
                  </div>
                  <span className="live-tag">● DEMO</span>
                </div>

                <div className="chart-placeholder">
                  {monitoringChart}
                </div>
              </div>

              {earthquakeAlertPanel}
            </div>

            <div className="panel history-panel">
              <div className="panel-header">
                <div>
                  <h3>Recent Events</h3>
                  <p>Latest seismic detection records</p>
                </div>
                <button
                  className="history-clear-button"
                  onClick={() => setActivePage('Event History')}
                >
                  View All
                </button>
              </div>

              {events.length > 0 ? (
                <div className="event-table-wrapper">
                  <table className="event-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Alert Level</th>
                        <th>PGA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.slice(0, 5).map((event) => (
                        <tr key={event.id}>
                          <td>{event.timestamp}</td>
                          <td>
                            <span className={`event-badge ${event.level.toLowerCase()}`}>
                              {event.level}
                            </span>
                          </td>
                          <td>{formatValue(event.pga)} g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-history">
                  No seismic events recorded.
                </div>
              )}
            </div>
          </>
        )

      case 'Seismic Monitoring':
        return (
          <>
            <div className="welcome">
              <div>
                <h2>Seismic Monitoring</h2>
                <p>Detailed ground acceleration measurements</p>
              </div>
              <span className="demo-tag">DEMO DATA</span>
            </div>

            <div className="stats-grid">
              {[
                { label: 'CURRENT PGA', value: formatValue(sensorReading.pga), unit: 'g', description: 'Combined X, Y, Z reading' },
                { label: 'PEAK PGA', value: formatValue(sensorReading.peakPga), unit: 'g', description: 'Highest reading this session' },
                { label: 'ALERT LEVEL', value: alertState.level, unit: '', description: 'Confirmed system condition' },
                { label: 'LAST UPDATE', value: sensorReading.time, unit: '', description: 'Latest packet received' },
              ].map(({ label, value, unit, description }) => (
                <div className="stat-card" key={label}>
                  <p>{label}</p>
                  <h2>{value} {unit && <span>{unit}</span>}</h2>
                  <small>{description}</small>
                </div>
              ))}
            </div>

            <div className="panel acceleration-panel">
              <div className="panel-header">
                <div>
                  <h3>Three-Axis Acceleration</h3>
                  <p>Continuous seismic sensor measurements</p>
                </div>
                <span className="live-tag">● DEMO</span>
              </div>

              <div className="chart-placeholder">
                {monitoringChart}
              </div>
            </div>

            {earthquakeAlertPanel}

            <div className="panel history-panel">
              <h3>Measurement Information</h3>
              <div className="empty-history">
                <p>Monitoring data is currently simulated.</p>
                <p>Latest measurement: {sensorReading.time}</p>
              </div>
            </div>

            <SimulationTestMode onTest={handleSimulationTest} />
          </>
        )

      case 'Seismic Map':
        return (
          <SeismicMap
            sensorReading={sensorReading}
            alertState={alertState}
          />
        )

      case 'Node Status':
        return nodeStatusPage

      case 'Event History':
        return eventHistoryPage

      case 'System Settings':
        return (
          <>
            <div className="welcome">
              <div>
                <h2>System Settings</h2>
                <p>Configure IEEWS dashboard and monitoring parameters</p>
              </div>
              <span className="demo-tag">LOCAL CONFIGURATION</span>
            </div>

            <div className="settings-notice">
              These settings currently apply to this dashboard prototype only.
              They do not configure the ESP32 or LoRa E220 hardware yet.
            </div>

            <div className="settings-grid">
              <div className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h3>General Settings</h3>
                    <p>System identification</p>
                  </div>
                  <span className="settings-section-number">01</span>
                </div>

                <div className="settings-fields">
                  <label className="settings-field">
                    <span>System Name</span>
                    <input
                      value={settings.systemName}
                      onChange={(e) => updateSetting('systemName', e.target.value)}
                      placeholder="Enter system name"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Project Name</span>
                    <input
                      value={settings.projectName}
                      onChange={(e) => updateSetting('projectName', e.target.value)}
                      placeholder="Enter project name"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Deployment Location</span>
                    <input
                      value={settings.location}
                      onChange={(e) => updateSetting('location', e.target.value)}
                      placeholder="e.g. Building / test site"
                    />
                  </label>
                </div>
              </div>

              <div className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h3>Alert Thresholds</h3>
                    <p>Peak Ground Acceleration (PGA)</p>
                  </div>
                  <span className="settings-section-number">02</span>
                </div>

                <div className="settings-fields">
                  <label className="settings-field">
                    <span>Elevated threshold (g)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={settings.elevated}
                      onChange={(e) => updateSetting('elevated', e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Warning threshold (g)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={settings.warning}
                      onChange={(e) => updateSetting('warning', e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Critical threshold (g)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={settings.critical}
                      onChange={(e) => updateSetting('critical', e.target.value)}
                    />
                  </label>
                  <p className="settings-help">
                    Required order: 0 ≤ Elevated &lt; Warning &lt; Critical.
                  </p>
                </div>
              </div>

              <div className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h3>Sensor Configuration</h3>
                    <p>Outer Node measurement settings</p>
                  </div>
                  <span className="settings-section-number">03</span>
                </div>

                <div className="settings-fields">
                  <label className="settings-field">
                    <span>Accelerometer</span>
                    <input value={settings.sensor} readOnly />
                  </label>
                  <label className="settings-field">
                    <span>Sampling interval (ms)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={settings.samplingInterval}
                      onChange={(e) => updateSetting('samplingInterval', e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Measurement unit</span>
                    <input value={settings.measurementUnit} readOnly />
                  </label>
                  <p className="settings-help">
                    Sensor model and unit are informational in this prototype.
                  </p>
                </div>
              </div>

              <div className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h3>Communication Settings</h3>
                    <p>Wireless link configuration</p>
                  </div>
                  <span className="settings-section-number">04</span>
                </div>

                <div className="settings-fields">
                  <label className="settings-field">
                    <span>LoRa Module</span>
                    <input value={settings.loraModel} readOnly />
                  </label>
                  <label className="settings-field">
                    <span>LoRa Interface</span>
                    <input value={settings.loraRole} readOnly />
                  </label>
                  <label className="settings-field">
                    <span>Network Type</span>
                    <input value={settings.networkType} readOnly />
                  </label>
                  <label className="settings-field">
                    <span>Network Mode</span>
                    <input value={settings.networkMode} readOnly />
                  </label>
                  <p className="settings-help">
                    Communication values will be connected to the Inner Node firmware later.
                  </p>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <div>
                {settingsSaved ? (
                  <span className="settings-saved">Settings applied to this session.</span>
                ) : (
                  <span className="settings-unsaved">Changes are not applied yet.</span>
                )}
              </div>
              <div className="settings-action-buttons">
                <button className="settings-reset-button" onClick={resetSettings}>
                  Reset Defaults
                </button>
                <button className="settings-save-button" onClick={saveSettings}>
                  Apply Settings
                </button>
              </div>
            </div>
          </>
        )

      default:
        return null
    }
  }

  // MAIN LAYOUT
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <img
            src={ieewsLogo}
            alt="IEEWS Logo"
            className="brand-logo"
          />
          <div className="brand-copy">
            <h2>IEEWS</h2>
            <span>EARTHQUAKE WARNING</span>
          </div>
        </div>

        <nav className="nav-section" aria-label="Main navigation">
          <p className="nav-label">MAIN MENU</p>

          <div className="nav-list">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                aria-current={activePage === item.label ? 'page' : undefined}
                className={`nav-item ${activePage === item.label ? 'active' : ''}`}
                onClick={() => setActivePage(item.label)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-text">{item.label}</span>
                {activePage === item.label && <span className="nav-active-indicator" />}
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            aria-current={activePage === 'System Settings' ? 'page' : undefined}
            className={`nav-item settings-nav-item ${activePage === 'System Settings' ? 'active' : ''}`}
            onClick={() => setActivePage('System Settings')}
          >
            <span className="nav-icon" aria-hidden="true">⚙</span>
            <span className="nav-text">System Settings</span>
            {activePage === 'System Settings' && <span className="nav-active-indicator" />}
          </button>

          <div className="sidebar-footer">
            <img
              src={ieewsLogo}
              alt=""
              aria-hidden="true"
              className="sidebar-footer-logo"
            />
            <div>
              <strong>IEEWS Dashboard</strong>
              <p>Version 1.0.0 · 2026</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>
              {activePage === 'Overview' ? 'System Overview' : activePage}
            </h1>
            <p>Integrated Earthquake Early Warning System</p>
          </div>

          <div className="system-status">
            <span className="status-dot"></span>
            DEMO MODE · {connectionStatus}
          </div>
        </header>

        <section className="content">
          {renderPage()}

          <footer>
            IEEWS Monitoring System · Capstone Project · 2026
          </footer>
        </section>
      </main>
    </div>
  )
}

export default App

