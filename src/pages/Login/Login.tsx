import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './Login.css'
import { AlertModal } from '../../utils/alertHelper'
import Loader from '../../components/Loader/Loader'

const Login = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Basic validation
    if (!email.trim()) {
      AlertModal.warning('Please enter your email', 3000)
      return
    }
    
    if (!password.trim()) {
      AlertModal.warning('Please enter your password', 3000)
      return
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      AlertModal.warning('Please enter a valid email address', 3000)
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('http://192.168.1.45:3000/login', {
        email: email.trim(),
        password: password.trim(),
      })
      
      if (response.data.success) {
        // Store token in localStorage
        const token = response.data.data?.token || response.data.token || response.data.data?.accessToken
        if (token) {
          localStorage.setItem('token', token)
        } else {
          // If no token in response, still store a flag to indicate successful login
          localStorage.setItem('token', 'authenticated')
        }
        
        // Store user data if available
        if (response.data.data?.user) {
          localStorage.setItem('user', JSON.stringify(response.data.data.user))
        } else if (response.data.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user))
        }
        
        AlertModal.success(response.data.message || 'Login successful!', 3000)
        
        // Reset form
        setEmail('')
        setPassword('')
        
        // Redirect to dashboard after successful login
        setTimeout(() => {
          navigate('/dashboard')
        }, 1000)
      } else {
        AlertModal.error(response.data.message || 'Login failed', 5000)
      }
    } catch (error: any) {
      AlertModal.error(error.response?.data?.message || 'An error occurred during login', 5000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <h2 className="login-title">Login</h2>
        
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
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

export default Login
