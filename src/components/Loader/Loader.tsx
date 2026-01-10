import './Loader.css'

interface LoaderProps {
  message?: string
  fullScreen?: boolean
}

const Loader = ({ message = 'Loading...', fullScreen = true }: LoaderProps) => {
  return (
    <div className={`loader-overlay ${fullScreen ? 'fullscreen' : ''}`}>
      <div className="loader-content">
        <div className="loader-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        {message && <p className="loader-message">{message}</p>}
      </div>
    </div>
  )
}

export default Loader

