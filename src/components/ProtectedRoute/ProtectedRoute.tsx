import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '../../utils/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  // Check if user is authenticated
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

export default ProtectedRoute

