import { useEffect, useState } from 'react'
import './Alert.css'

interface AlertProps {
  message: string
  type: 'success' | 'error' | 'warning'
  duration?: number
  onClose?: () => void
}

const Alert = ({ message, type, duration = 5000, onClose }: AlertProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // Trigger slide-in animation
    setTimeout(() => setIsVisible(true), 10)

    // Auto-close after duration
    const timer = setTimeout(() => {
      handleClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 300) // Wait for fade-out animation
  }

  if (!isVisible && !isExiting) return null

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓'
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      default:
        return ''
    }
  }

  return (
    <div
      className={`alert-container ${type} ${isVisible && !isExiting ? 'show' : 'hide'}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="alert-content">
        <span className="alert-icon">{getIcon()}</span>
        <span className="alert-message">{message}</span>
        <button className="alert-close" onClick={handleClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="alert-progress-bar">
        <div
          className="alert-progress-fill"
          style={{
            animation: `shrink ${duration}ms linear forwards`,
          }}
        />
      </div>
    </div>
  )
}

export default Alert

