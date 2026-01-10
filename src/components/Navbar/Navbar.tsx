import { Link, useNavigate, useLocation } from 'react-router-dom'
import logo from '../../assets/logo.png'
import { isAuthenticated, removeToken } from '../../utils/auth'
import './Navbar.css'

const Navbar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const authenticated = isAuthenticated()

  // Don't show navbar on login page, test page, or thank you page
  if (location.pathname === '/login' || location.pathname.startsWith('/test/') || location.pathname === '/thank-you') {
    return null
  }

  const handleLogout = () => {
    removeToken()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to={authenticated ? "/dashboard" : "/"}>
            <img src={logo} alt="Evalv-AI" className="navbar-logo" />
          </Link>
        </div>

        <div className="navbar-menu">
          {authenticated ? (
            <>
              <Link
                to="/dashboard"
                className={location.pathname === '/dashboard' ? 'active' : ''}
              >
                Dashboard
              </Link>
              <Link
                to="/job-description"
                className={location.pathname === '/job-description' ? 'active' : ''}
              >
                Job Description
              </Link>
              <Link
                to="/application"
                className={location.pathname === '/application' ? 'active' : ''}
              >
                Application Form
              </Link>
              <button onClick={handleLogout} className="logout-button">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={location.pathname === '/login' ? 'active' : ''}
              >
                Login
              </Link>
              <Link
                to="/application"
                className={location.pathname === '/application' ? 'active' : ''}
              >
                Apply
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar

