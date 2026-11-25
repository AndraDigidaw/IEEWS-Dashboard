import { useState } from 'react'

const scenarios = [
  {
    name: 'NORMAL',
    pga: 0.020,
    description: 'No significant seismic activity detected.',
    className: 'alert-normal',
    icon: '✓',
  },
  {
    name: 'ELEVATED',
    pga: 0.080,
    description: 'Elevated ground acceleration detected.',
    className: 'alert-elevated',
    icon: '!',
  },
  {
    name: 'WARNING',
    pga: 0.150,
    description: 'Significant seismic activity detected.',
    className: 'alert-warning',
    icon: '!',
  },
  {
    name: 'CRITICAL',
    pga: 0.300,
    description: 'Critical acceleration level detected.',
    className: 'alert-critical',
    icon: '!!',
  },
]

function SimulationTestMode({ onTest }) {
  const [selectedScenario, setSelectedScenario] = useState(0)

  const current = scenarios[selectedScenario]

  const handleScenario = (scenario, index) => {
    setSelectedScenario(index)

    if (onTest) {
      onTest(scenario)
    }
  }

  return (
    <div className="simulation-panel panel">

      <div className="panel-header">
        <div>
          <h3>Simulation Test Mode</h3>
          <p>Manually test earthquake alert conditions</p>
        </div>

        <span className="demo-tag">TEST MODE</span>
      </div>

      <div className="simulation-buttons">

        {scenarios.map((scenario, index) => (
          <button
            key={scenario.name}
            type="button"
            className={`scenario-button ${
              selectedScenario === index ? 'selected' : ''
            }`}
            onClick={() => handleScenario(scenario, index)}
          >
            {scenario.name}
          </button>
        ))}

      </div>

      <div className={`simulation-result ${current.className}`}>

        <div className="alert-icon">
          {current.icon}
        </div>

        <h2>{current.name}</h2>

        <p>{current.description}</p>

        <div className="simulation-pga">
          Simulated PGA:{' '}
          <strong>{current.pga.toFixed(3)} g</strong>
        </div>

      </div>

      <p className="simulation-note">
        Demonstration only. Values are simulated and are not actual sensor readings.
      </p>

    </div>
  )
}

export default SimulationTestMode

