import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from '../pages/Login/Login'
import JobDescription from '../pages/JobDescription/JobDescription'
import ApplicationForm from '../pages/ApplicationForm/ApplicationForm'
import Dashboard from '../pages/Dashboard/Dashboard'
import ProtectedRoute from '../components/ProtectedRoute/ProtectedRoute'
import AuthCheck from '../components/AuthCheck/AuthCheck'
import Navbar from '../components/Navbar/Navbar'

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <AuthCheck />
      <Navbar />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/job-description"
          element={
            <ProtectedRoute>
              <JobDescription />
            </ProtectedRoute>
          }
        />
        
        <Route path="/application" element={<ProtectedRoute><ApplicationForm /></ProtectedRoute>} />
        
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRoutes

