import './ThankYou.css'

const ThankYou = () => {
  return (
    <div className="thank-you-container">
      <div className="thank-you-content">
        <div className="thank-you-icon">✓</div>
        <h1 className="thank-you-title">Thank You for Taking the Test!</h1>
        <p className="thank-you-message">
          Your exam has been submitted successfully. We appreciate your time and effort.
        </p>
        <p className="thank-you-submessage">
          Our team will review your responses and get back to you soon.
        </p>
      </div>
    </div>
  )
}

export default ThankYou

