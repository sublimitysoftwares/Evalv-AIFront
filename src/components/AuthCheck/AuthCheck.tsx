import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isAuthenticated } from '../../utils/auth'

/**
 * Component to check authentication status on app load
 * and redirect to login if not authenticated (except for public routes)
 */
const AuthCheck = () => {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const publicRoutes = ['/login']
    const isPublicRoute = publicRoutes.includes(location.pathname) || location.pathname.startsWith('/test/')

    // If not on a public route and not authenticated, redirect to login
    if (!isPublicRoute && !isAuthenticated()) {
      navigate('/login', { replace: true })
    }
  }, [navigate, location.pathname])

  return null
}

export default AuthCheck

