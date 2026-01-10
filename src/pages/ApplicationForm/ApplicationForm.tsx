import { useState, useEffect } from 'react'
import axios from 'axios'
import './ApplicationForm.css'
import { AlertModal } from '../../utils/alertHelper'
import Loader from '../../components/Loader/Loader'

const ApplicationForm = () => {
  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [selectedJobDescription, setSelectedJobDescription] = useState<any>(null)
  const [jobDescriptions, setJobDescriptions] = useState([])
  const [loading, setLoading] = useState<boolean>(false)
  const [fetchingJobs, setFetchingJobs] = useState<boolean>(false)
  const [userID, setUserID] = useState<any>(null)

  useEffect(() => {
    fetchJobDescriptions()
  }, [])

  const fetchJobDescriptions = async () => {
    setFetchingJobs(true)
    try {
      const response = await axios.get('http://192.168.1.45:3000/domain-job-description')
      if (response.data.success) {
        setJobDescriptions(response.data.data)
      } else {
        AlertModal.error(response.data.message || 'Failed to fetch job descriptions', 5000)
        setJobDescriptions([])
      }
    } catch (error: any) {
      AlertModal.error(error.response?.data?.message || 'Error fetching job descriptions', 5000)
      setJobDescriptions([])
    } finally {
      setFetchingJobs(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Basic validation
    if (!name.trim()) {
      AlertModal.warning('Please enter your name', 3000)
      return
    }
    
    if (!email.trim()) {
      AlertModal.warning('Please enter your email', 3000)
      return
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      AlertModal.warning('Please enter a valid email address', 3000)
      return
    }
    
    if (!selectedJobDescription) {
      AlertModal.warning('Please select a job description', 3000)
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('http://192.168.1.45:3000/interview-candidate', {
        name: name.trim(),
        email_address: email.trim(),
        tblDomainJobDescription_id: selectedJobDescription,
      })
      
      if (response.data.success) {
        AlertModal.success(response.data.message || 'Application submitted successfully!', 5000)
        setName('')
        setEmail('')
        setUserID(response.data.data._id)
        await callQuestions(response.data.data._id);
      } else {
        AlertModal.error(response.data.message || 'Failed to submit application', 5000)
        setLoading(false)
      }
    } catch (error: any) {
      AlertModal.error(error.response?.data?.message || 'An error occurred while submitting', 5000)
      setLoading(false)
    }
  }

  const callQuestions = async (id: string) => {
    setLoading(true)
    try {
      let desc = jobDescriptions.find((job: any) => job._id === selectedJobDescription);
      const response = await axios.post(`http://192.168.1.6:8000/generate-questions`,{
          "job_description": desc.job_description,
          "domain": desc.domain?.domainName,
          "experience": String(desc.required_exeperience)
      })
      if (response.data.success) {
        let questions = response.data.questions;
        await axios.post(`http://192.168.1.45:3000/question`, {
          tblDomainJobDescription_id: selectedJobDescription,
           question: questions, 
           tblInterviewCandidate_id: id
        })
        if (response.data.success) {
          AlertModal.success(response.data.message || 'Questions generated successfully!', 5000);
          await axios.post(`http://192.168.1.45:3000/interview-candidate/send-invite`, {
              candidateId: id,
              url: 'http://192.168.1.48:5173/test/'+id
          });
          if (response.data.success) {
            AlertModal.success(response.data.message || 'Invite sent successfully!', 5000);
            setUserID(null);
          } else {
            AlertModal.error(response.data.message || 'Failed to send invite', 5000);
            setUserID(null);
          }
          setSelectedJobDescription(null);
        } else {
          AlertModal.error(response.data.message || 'Failed to generate questions', 5000);
        }
      } else {
        AlertModal.error(response.data.message || 'Failed to generate questions', 5000);
      }
    } catch (error: any) {
      AlertModal.error(error.response?.data?.message || 'An error occurred while generating questions', 5000);
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {(loading || fetchingJobs) && (
        <Loader message={
          fetchingJobs 
            ? 'Loading job descriptions...' 
            : loading 
              ? 'Processing your application...' 
              : 'Loading...'
        } />
      )}
      <div className="application-form-container">
        <form className="application-form" onSubmit={handleSubmit}>
          <h2 className="form-title">Application Form</h2>
          
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="jobDescription">Job Description</label>
            <select
              id="jobDescription"
              className="form-select"
              value={selectedJobDescription}
              onChange={(e) => setSelectedJobDescription(e.target.value)}
              disabled={loading || fetchingJobs}
            >
              <option value="">
                {fetchingJobs ? 'Loading job descriptions...' : 'Select a job description'}
              </option>
              {jobDescriptions.map((job: any) => (
                <option key={job._id} value={job._id}>
                  {job.domain?.domainName}-{job.required_exeperience} years experience
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="submit-button" disabled={loading || fetchingJobs}>
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </>
  )
}

export default ApplicationForm

