import { useState, useEffect } from 'react'
import axios from 'axios';
import './JobDescription.css';
import { AlertModal } from '../../utils/alertHelper';
import Loader from '../../components/Loader/Loader';


const JobDescription = () => {
  const [domains, setDomains] = useState([])
  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [requiredExperience, setRequiredExperience] = useState<number>(0)
  const [jobDescription, setJobDescription] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    fetchDomains()
  }, [])

  const fetchDomains = async () => {
    setLoading(true)
    const response = await axios.get('http://192.168.1.45:3000/domain-list')
    if (response.data.success) {
      console.log(response.data.data)
      setDomains(response.data.data)
      setLoading(false)
    } else {
      setLoading(false)
      setDomains([])
      console.log(response.data.message)
    }
  }

  const handleSubmit = async(e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await axios.post('http://192.168.1.45:3000/domain-job-description', {
        domain: selectedDomain,
        required_exeperience: requiredExperience,
        job_description: jobDescription,
      })
      if (response.data.success) {
        AlertModal.success(response.data.message, 5000)
        setJobDescription('')
        setRequiredExperience(0)
        setSelectedDomain('')
      } else {
        AlertModal.error(response.data.message, 5000)
      }
    } catch (error: any) {
      AlertModal.error(error.response?.data?.message || 'An error occurred', 5000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {loading && <Loader message="Submitting..." />}
      <div className="job-description-container">
        <form className="job-description-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="domain">Domain</label>
          <select
            id="domain"
            className="form-select"
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            disabled={loading}
          >
            <option value="">Select a domain</option>
            {domains.map((domain: { id: string, name: string }) => (
              <option key={domain?.id} value={domain?.id}>
                {domain?.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="experience">Required Experience (years)</label>
          <input
            type="number"
            id="experience"
            className="form-input"
            value={requiredExperience}
            onChange={(e) => setRequiredExperience(Number(e.target.value))}
            min="0"
          />
        </div>

        <div className="form-group">
          <label htmlFor="jobDescription">Job Description</label>
          <textarea
            id="jobDescription"
            className="form-textarea"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={10}
          />
        </div>

        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </div>
    </>
  )
}

export default JobDescription

