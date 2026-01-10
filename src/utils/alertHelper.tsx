import { createRoot } from 'react-dom/client'
import Alert from '../components/Alert/Alert'

interface AlertOptions {
  duration?: number
}

const showAlert = (
  message: string,
  type: 'success' | 'error' | 'warning',
  options: AlertOptions = {}
) => {
  // Remove any existing alerts
  const existingAlert = document.querySelector('.alert-container')
  if (existingAlert) {
    existingAlert.remove()
  }

  // Create container for the alert
  const alertContainer = document.createElement('div')
  document.body.appendChild(alertContainer)

  // Create React root and render alert
  const root = createRoot(alertContainer)
  
  const handleClose = () => {
    setTimeout(() => {
      root.unmount()
      if (alertContainer.parentNode) {
        alertContainer.parentNode.removeChild(alertContainer)
      }
    }, 300)
  }

  root.render(
    <Alert
      message={message}
      type={type}
      duration={options.duration || 5000}
      onClose={handleClose}
    />
  )
}

export const AlertModal = {
  success: (message: string, duration?: number) => {
    showAlert(message, 'success', { duration })
  },
  error: (message: string, duration?: number) => {
    showAlert(message, 'error', { duration })
  },
  warning: (message: string, duration?: number) => {
    showAlert(message, 'warning', { duration })
  },
}

export default AlertModal

