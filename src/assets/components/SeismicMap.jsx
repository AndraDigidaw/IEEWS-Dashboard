import { useEffect } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './SeismicMap.css'

// NODE LOCATIONS
const NODE_LOCATIONS = [
  {
    id: 'OUTER-01',
    name: 'Outer Node',
    location: 'Plaza Oleos',
    lat: -6.2980355402090895,
    lng: 106.82967549624084,
    type: 'outer',
  },
  {
    id: 'INNER-01',
    name: 'Inner Node',
    location: 'Gedung S FTUI',
    lat: -6.361432463134065,
    lng: 106.82471127246713,
    type: 'inner',
  },
]

// ALERT COLORS
const ALERT_COLORS = {
  normal: '#22c55e',
  elevated: '#eab308',
  warning: '#f97316',
  critical: '#ef4444',
}

const ALERT_LABELS = {
  normal: 'NORMAL',
  elevated: 'ELEVATED',
  warning: 'WARNING',
  critical: 'CRITICAL',
}

// INNER NODE COLOR
const INNER_NODE_COLOR = '#3b82f6'

// CUSTOM MARKER
function createSensorIcon(color) {
  return L.divIcon({
    className: 'sensor-map-marker-wrapper',
    html: `
      <div class="sensor-map-marker" style="--marker-color: ${color}">
        <div class="sensor-map-marker-pulse"></div>
        <div class="sensor-map-marker-core"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

// MAP CONTROLLER
function MapController({ locations }) {
  const map = useMap()

  useEffect(() => {
    const bounds = L.latLngBounds(
      locations.map((node) => [node.lat, node.lng])
    )

    map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 16,
    })
  }, [map, locations])

  return null
}

export default function SeismicMap({
  sensorReading,
  alertState,
}) {
  // ALERT DATA
  const level = (alertState?.level || 'normal').toLowerCase()
  const outerColor = ALERT_COLORS[level] || ALERT_COLORS.normal
  const alertLabel = ALERT_LABELS[level] || 'NORMAL'

  const pga = Number(sensorReading?.pga ?? 0)
  const pgaValue = Number.isFinite(pga) ? pga : 0

  // NODE DATA
  const outerNode = NODE_LOCATIONS.find(
    (node) => node.type === 'outer'
  )

  const innerNode = NODE_LOCATIONS.find(
    (node) => node.type === 'inner'
  )

  const outerPosition = [outerNode.lat, outerNode.lng]
  const innerPosition = [innerNode.lat, innerNode.lng]

  const sensorId = sensorReading?.node_id || outerNode.id

  return (
    <div className="seismic-map-page">

      {/* HEADER */}
      <div className="seismic-map-header">
        <div>
          <div className="seismic-map-eyebrow">
            GEOGRAPHICAL MONITORING
          </div>

          <h2>Seismic Map</h2>

          <p>
            Geographic visualization of seismic sensor stations
          </p>
        </div>

        <div className="seismic-map-demo-badge">
          <span className="demo-indicator"></span>
          NODE LOCATIONS
        </div>
      </div>

      {/* MAIN MAP */}
      <div className="seismic-map-layout">

        <div className="seismic-map-container">

          <MapContainer
            center={outerPosition}
            zoom={13}
            scrollWheelZoom={true}
            className="seismic-leaflet-map"
          >

            {/* MAP TILE */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* AUTO ZOOM */}
            <MapController locations={NODE_LOCATIONS} />

            {/* OUTER NODE ALERT RADIUS */}
            <Circle
              center={outerPosition}
              radius={100}
              pathOptions={{
                color: outerColor,
                fillColor: outerColor,
                fillOpacity: 0.12,
                weight: 1,
              }}
            />

            {/* CONNECTION LINE */}
            <Polyline
              positions={[outerPosition, innerPosition]}
              pathOptions={{
                color: '#64748b',
                weight: 2,
                dashArray: '6 8',
                opacity: 0.65,
              }}
            />

            {/* OUTER NODE */}
            <Marker
              position={outerPosition}
              icon={createSensorIcon(outerColor)}
            >
              <Popup>
                <div className="sensor-map-popup">
                  <strong>{sensorId}</strong>
                  <br />
                  Node: Outer Node
                  <br />
                  Location: Plaza Oleos
                  <br />
                  Status: {alertLabel}
                  <br />
                  PGA: {pgaValue.toFixed(3)} g
                  <br />
                  <small>
                    {outerNode.lat.toFixed(6)}, {outerNode.lng.toFixed(6)}
                  </small>
                </div>
              </Popup>
            </Marker>

            {/* INNER NODE */}
            <Marker
              position={innerPosition}
              icon={createSensorIcon(INNER_NODE_COLOR)}
            >
              <Popup>
                <div className="sensor-map-popup">
                  <strong>{innerNode.id}</strong>
                  <br />
                  Node: Inner Node
                  <br />
                  Location: Gedung S FTUI
                  <br />
                  Role: LoRa Gateway
                  <br />
                  Status: Gateway
                  <br />
                  <small>
                    {innerNode.lat.toFixed(6)}, {innerNode.lng.toFixed(6)}
                  </small>
                </div>
              </Popup>
            </Marker>

          </MapContainer>

          {/* MAP OVERLAY */}
          <div className="seismic-map-overlay">
            <span
              className="map-overlay-dot"
              style={{ background: outerColor }}
            ></span>
            OUTER NODE: {alertLabel}
          </div>

        </div>

        {/* INFORMATION PANEL */}
        <div className="seismic-map-info">

          <div className="map-info-title">
            NODE INFORMATION
          </div>

          {/* OUTER NODE CARD */}
          <div className="map-node-card">

            <div className="map-node-top">
              <span className="map-node-icon">⌖</span>
              <span className="map-node-id">{outerNode.id}</span>
            </div>

            <div className="map-node-status">
              <span
                className="map-status-dot"
                style={{ background: outerColor }}
              ></span>

              <span style={{ color: outerColor }}>
                {alertLabel}
              </span>
            </div>

            <div className="map-pga-label">
              Outer Node — Plaza Oleos
            </div>

            <div className="map-pga-value">
              {pgaValue.toFixed(3)}
              <span> g</span>
            </div>

            <div className="map-node-coordinates">
              <div>
                <span>LATITUDE</span>
                <strong>{outerNode.lat.toFixed(6)}</strong>
              </div>

              <div>
                <span>LONGITUDE</span>
                <strong>{outerNode.lng.toFixed(6)}</strong>
              </div>
            </div>
          </div>

          {/* INNER NODE CARD */}
          <div className="map-node-card">

            <div className="map-node-top">
              <span
                className="map-node-icon"
                style={{ color: INNER_NODE_COLOR }}
              >
                ⌖
              </span>

              <span className="map-node-id">{innerNode.id}</span>
            </div>

            <div className="map-node-status">
              <span
                className="map-status-dot"
                style={{ background: INNER_NODE_COLOR }}
              ></span>

              <span style={{ color: INNER_NODE_COLOR }}>
                GATEWAY
              </span>
            </div>

            <div className="map-pga-label">
              Inner Node — Gedung S FTUI
            </div>

            <div className="map-pga-value">
              <span style={{ fontSize: '16px' }}>
                LoRa Receiver
              </span>
            </div>

            <div className="map-node-coordinates">
              <div>
                <span>LATITUDE</span>
                <strong>{innerNode.lat.toFixed(6)}</strong>
              </div>

              <div>
                <span>LONGITUDE</span>
                <strong>{innerNode.lng.toFixed(6)}</strong>
              </div>
            </div>
          </div>

          {/* ALERT LEGEND */}
          <div className="map-legend-card">

            <div className="map-info-title">
              OUTER NODE ALERT LEGEND
            </div>

            {Object.entries(ALERT_COLORS).map(([key, value]) => (
              <div className="map-legend-item" key={key}>
                <span
                  className="map-legend-color"
                  style={{ background: value }}
                ></span>

                <span>{ALERT_LABELS[key]}</span>
              </div>
            ))}

            <div className="map-legend-item">
              <span
                className="map-legend-color"
                style={{ background: INNER_NODE_COLOR }}
              ></span>

              <span>Inner Node / Gateway</span>
            </div>
          </div>

          <div className="map-disclaimer">
            Node coordinates represent configured station locations.
            The dashed line represents the communication architecture,
            not the actual LoRa coverage area.
          </div>

        </div>
      </div>
    </div>
  )
}

