import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

const Dashboard = () => {
  const navigate = useNavigate()

  // Static Data
  const kpis = [
    { label: 'Total Interviews Sent', value: 128 },
    { label: 'Interviews Completed', value: 92 },
    { label: 'Qualified Candidates', value: 34 },
    { label: 'Pending Interviews', value: 36 },
  ]

  const recentInterviews = [
    { name: 'Rahul', domain: 'Node.js', level: '2–4 yrs', status: 'Qualified', score: '82%' },
    { name: 'Priya', domain: 'QA', level: '1–2 yrs', status: 'Pending', score: '—' },
    { name: 'Aman', domain: 'Flutter', level: '4+ yrs', status: 'Not Qualified', score: '41%' },
    { name: 'Sneha', domain: '.NET', level: '2–4 yrs', status: 'Qualified', score: '78%' },
    { name: 'Vikram', domain: 'BA', level: '5+ yrs', status: 'Pending', score: '—' },
  ]

  const hiringData = [
    { domain: 'Node.js', value: 28 },
    { domain: 'Flutter', value: 20 },
    { domain: 'QA', value: 16 },
    { domain: '.NET', value: 12 },
    { domain: 'BA', value: 9 },
    { domain: 'PM', value: 6 },
  ]

  // Helper for max value to calculate percentage width
  const maxHiringValue = Math.max(...hiringData.map(d => d.value))

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>

      </div>

      {/* Top KPIs */}
      <div className="kpi-grid">
        {kpis.map((kpi, index) => (
          <div key={index} className="kpi-card">
            <h3>{kpi.label}</h3>
            <p className="kpi-value">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="dashboard-main-grid">
        {/* Recent Interviews Table */}
        <div className="section-card">
          <div className="section-title">
            <span>⏳</span> Recent Interviews
          </div>
          <div className="table-container">
            <table className="interviews-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Domain</th>
                  <th>Level</th>
                  <th>Status</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {recentInterviews.map((interview, index) => (
                  <tr key={index}>
                    <td>{interview.name}</td>
                    <td>{interview.domain}</td>
                    <td>{interview.level}</td>
                    <td>
                      <span className={`status-badge status-${interview.status.toLowerCase().replace(' ', '-')}`}>
                        {interview.status}
                      </span>
                    </td>
                    <td>{interview.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button className="action-btn btn-secondary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>View All Results</button>
          </div>
        </div>

        {/* Right Column: Chart & Insights */}
        <div>
          <div className="section-card" style={{ marginBottom: '2rem' }}>
            <div className="section-title">
              <span>📊</span> Hiring by Domain
            </div>
            <div className="chart-container">
              {hiringData.map((data, index) => (
                <div key={index} className="chart-row">
                  <span className="chart-label">{data.domain}</span>
                  <div className="chart-bar-bg">
                    <div
                      className="chart-bar-fill"
                      style={{ '--target-width': `${(data.value / maxHiringValue) * 100}%` } as React.CSSProperties}
                    ></div>
                  </div>
                  <span className="chart-value">{data.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-insight-box">
            <div className="ai-insight-title">
              <span>🎯</span> AI Insights
            </div>
            <p className="ai-insight-text">
              "Flutter domain candidates have <strong>62% qualification rate</strong> this month.
              QA domain has the highest rejection ratio."
            </p>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button className="action-btn btn-secondary" style={{ width: '100%' }}>📤 Send Bulk Invites (Coming Soon)</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
