import { useState, useEffect } from 'react'
import axios from 'axios'
import './Dashboard.css'
import Loader from '../../components/Loader/Loader'
import { AlertModal } from '../../utils/alertHelper'

interface TableRow {
  domain: string
  experience: number
  name: string
  percent: number
  suspiciousAnswer: number
  _id?: string
}

const Dashboard = () => {
  const [tableData, setTableData] = useState<TableRow[]>([])
  const [filteredData, setFilteredData] = useState<TableRow[]>([])
  const [domains, setDomains] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [filterDomain, setFilterDomain] = useState<string>('')
  const [filterExperience, setFilterExperience] = useState<string>('')
  const [filterScore, setFilterScore] = useState<string>('')

  useEffect(() => {
    fetchDomains()
    fetchTableData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [filterDomain, filterExperience, filterScore, tableData])

  const fetchDomains = async () => {
    try {
      const response = await axios.get('http://localhost:3000/domain-list')
      if (response.data.success) {
        setDomains(response.data.data)
      }
    } catch (error: any) {
      console.error('Error fetching domains:', error)
    }
  }

  const fetchTableData = async () => {
    setLoading(true)
    try {
      // Replace this endpoint with your actual API endpoint for candidate statistics
      const response = await axios.get('http://localhost:3000/get-candidate-answer')
      
      if (response.data.success) {
        // Transform the data to match table structure
        const transformedData = response.data.data.map((item: any) => {
          // Count questions with ai_generated_suspicion true
          const answerArray = item.answer || []
          const suspiciousCount = Array.isArray(answerArray) 
            ? answerArray.filter((ans: any) => ans.ai_generated_suspicion === true).length 
            : 0
          
          return {
            domain: item.tblQuestionsDictionary_id.tblDomainJobDescription_id?.domain?.domainName || item.domain || 'N/A',
            experience: item.tblQuestionsDictionary_id.tblDomainJobDescription_id?.required_exeperience || 0,
            name: item.candidate_id.name || '',
            percent: item.AnswerScore || item.percent || 0,
            suspiciousAnswer: suspiciousCount,
            _id: item._id
          }
        })
        setTableData(transformedData)
      } else {
        AlertModal.error(response.data.message || 'Failed to fetch data', 5000)
      }
    } catch (error: any) {
      console.error('Error fetching table data:', error)
      // For development, use mock data if API fails
      const mockData: TableRow[] = []
      setTableData(mockData)
      AlertModal.warning('Using mock data. Please configure the API endpoint.', 3000)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...tableData]

    // Filter by domain
    if (filterDomain) {
      filtered = filtered.filter(item => 
        item.domain.toLowerCase().includes(filterDomain.toLowerCase())
      )
    }

    // Filter by experience
    if (filterExperience) {
      const experienceValue = parseInt(filterExperience)
      if (!isNaN(experienceValue)) {
        filtered = filtered.filter(item => item.experience === experienceValue)
      }
    }

    // Filter by score (percent) - show records >= filterScore
    if (filterScore) {
      const scoreValue = parseFloat(filterScore)
      if (!isNaN(scoreValue) && scoreValue >= 0 && scoreValue <= 100) {
        filtered = filtered.filter(item => item.percent >= scoreValue)
      }
    }

    setFilteredData(filtered)
  }

  const handleClearFilters = () => {
    setFilterDomain('')
    setFilterExperience('')
    setFilterScore('')
  }

  const uniqueExperiences = Array.from(new Set(tableData.map(item => item.experience))).sort((a, b) => a - b)

  return (
    <div className="dashboard-container">
      {loading && <Loader message="Loading dashboard data..." />}
      
      <div className="dashboard-content">
        <h1 className="dashboard-title">Dashboard</h1>
        
        <div className="filters-section">
          <div className="filter-group">
            <label htmlFor="domain-filter">Filter by Domain:</label>
            <select
              id="domain-filter"
              className="filter-select"
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
            >
              <option value="">All Domains</option>
              {domains.map((domain: any) => (
                <option key={domain._id || domain.id} value={domain.name || domain.domainName}>
                  {domain.name || domain.domainName}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="experience-filter">Filter by Experience:</label>
            <select
              id="experience-filter"
              className="filter-select"
              value={filterExperience}
              onChange={(e) => setFilterExperience(e.target.value)}
            >
              <option value="">All Experience Levels</option>
              {uniqueExperiences.map((exp) => (
                <option key={exp} value={exp}>
                  {exp} {exp === 1 ? 'year' : 'years'}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="score-filter">Minimum Score (%):</label>
            <input
              type="number"
              id="score-filter"
              className="filter-input"
              value={filterScore}
              onChange={(e) => {
                const value = e.target.value
                if (value === '' || (parseFloat(value) >= 0 && parseFloat(value) <= 100)) {
                  setFilterScore(value)
                }
              }}
              placeholder="0-100"
              min="0"
              max="100"
            />
          </div>

          {(filterDomain || filterExperience || filterScore) && (
            <button 
              className="clear-filters-button"
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="table-container">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Domain</th>
                <th>Experience (Years)</th>
                <th>Name</th>
                <th>Score (%)</th>
                <th>Suspicious Answer</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((row, index) => (
                  <tr key={row._id || index}>
                    <td>
                      <span style={{
                        color: row.percent >= (filterScore ? parseFloat(filterScore) : 70) ? "green" : "red",
                        paddingRight: "15px",
                        fontWeight: "600"
                      }}>
                        {row.percent >= (filterScore ? parseFloat(filterScore) : 70) ? "Q" : "F"}
                      </span>
                    </td>
                    <td>{row.domain}</td>
                    <td>{row.experience}</td>
                    <td>{row.name}</td>
                    <td>
                      <div className="percent-cell">
                        <span className="percent-value">{row.percent}%</span>
                        <div className="percent-bar-container">
                          <div 
                            className="percent-bar" 
                            style={{ width: `${row.percent}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td>{row.suspiciousAnswer}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="no-data">
                    {loading ? 'Loading...' : 'No data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredData.length > 0 && (
          <div className="table-summary">
            <p>Showing {filteredData.length} of {tableData.length} records</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
