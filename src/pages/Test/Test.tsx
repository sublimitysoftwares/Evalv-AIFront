import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { AlertModal } from '../../utils/alertHelper'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import Loader from '../../components/Loader/Loader'
import './Test.css'

interface Question {
  _id?: string
  question?: string
  expected_time_minutes?: number
  [key: string]: any
}

const Test = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<string[]>([]) // Changed to array
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [examStarted, setExamStarted] = useState<boolean>(false)
  const [examReady, setExamReady] = useState<boolean>(false) // Track if exam is ready to start
  const [baseAnswer, setBaseAnswer] = useState<string>('')
  const [isReadingQuestion, setIsReadingQuestion] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null)
  const [domain, setDomain] = useState<any>(null)
  const [experience, setExperience] = useState<any>(null);
  const [questionsDictionary, setQuestionsDictionary] = useState<any>(null);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition()

  // Add error handling for speech recognition
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      return
    }

    const recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (recognition) {
      const recognitionInstance = new recognition()
      
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        if (event.error === 'not-allowed') {
          AlertModal.error('Microphone permission denied. Please allow microphone access in your browser settings.', 5000)
        } else if (event.error === 'no-speech') {
          console.log('No speech detected')
        } else if (event.error === 'audio-capture') {
          AlertModal.error('No microphone found. Please connect a microphone.', 5000)
        } else {
          AlertModal.warning(`Speech recognition error: ${event.error}`, 3000)
        }
      }

      recognitionInstance.onstart = () => {
        console.log('Speech recognition started')
      }

      recognitionInstance.onend = () => {
        console.log('Speech recognition ended')
      }
    }
  }, [browserSupportsSpeechRecognition])

  useEffect(() => {
    if (id) {
      // Just check if ID exists, don't fetch questions yet
      setExamReady(true)
    } else {
      AlertModal.warning('No ID parameter provided in URL', 3000)
    }

    // Prevent browser close/refresh during exam
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (examStarted && !submitting) {
        e.preventDefault()
        e.returnValue = 'Are you sure you want to leave? Your exam progress will be lost!'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (speechSynthesisRef.current) {
        window.speechSynthesis.cancel()
      }
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Exit fullscreen on unmount
      if (isFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [id, examStarted, submitting, isFullscreen])

  useEffect(() => {
    if (examStarted && questions.length > 0 && currentQuestionIndex < questions.length) {
      // Update base answer when question changes
      setBaseAnswer(answers[currentQuestionIndex] || '')
      // Stop listening if active when switching questions
      if (listening) {
        SpeechRecognition.stopListening()
        resetTranscript()
      }
      // Read the question first, then start timer (only when question index changes)
      readQuestion(currentQuestionIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, examStarted, questions.length])

  // Enter fullscreen when exam starts
  useEffect(() => {
    if (examStarted && questions.length > 0) {
      enterFullscreen()
    }
  }, [examStarted, questions.length])

  const handleStartExam = async () => {
    if (id) {
      await fetchQuestions(id)
    }
  }

  const getPreferredVoice = (): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices()
    
    // Try to find a preferred voice (you can customize this)
    // Options: female voice, specific language, or specific voice name
    const preferredVoices = [
      // English female voices (common names)
      voices.find(voice => 
        voice.name.includes('Samantha') || 
        voice.name.includes('Karen') ||
        voice.name.includes('Victoria') ||
        voice.name.includes('Siri') ||
        voice.name.includes('Zira')
      ),
      // Any female voice
      voices.find(voice => 
        voice.name.toLowerCase().includes('female') ||
        voice.name.toLowerCase().includes('woman')
      ),
      // Google voices (usually good quality)
      voices.find(voice => 
        voice.name.includes('Google') && 
        (voice.lang.startsWith('en') || voice.lang === 'en-US')
      ),
      // Microsoft voices
      voices.find(voice => 
        voice.name.includes('Microsoft') && 
        (voice.lang.startsWith('en') || voice.lang === 'en-US')
      ),
      // Any English voice
      voices.find(voice => 
        voice.lang.startsWith('en') || voice.lang === 'en-US'
      ),
      // Fallback to first available voice
      voices[0]
    ]
    
    // Return the first available preferred voice
    return preferredVoices.find(voice => voice !== undefined) || null
  }

  const readQuestion = (questionIndex: number) => {
    const question = questions[questionIndex]
    const questionText = question?.question || `Question ${questionIndex + 1}`
    
    // Stop any previous speech and clear queue
    window.speechSynthesis.cancel()
    
    // Small delay to ensure speech synthesis is ready
    setTimeout(() => {
      if ('speechSynthesis' in window) {
        // Check if speech synthesis is speaking or pending
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          // Wait a bit more and try again
          setTimeout(() => readQuestion(questionIndex), 200)
          return
        }
        
        setIsReadingQuestion(true)
        const utterance = new SpeechSynthesisUtterance(questionText)
        
        // Get and set preferred voice
        const voices = window.speechSynthesis.getVoices()
        const preferredVoice = getPreferredVoice()
        
        if (preferredVoice) {
          utterance.voice = preferredVoice
        } else if (voices.length > 0) {
          // Fallback: use first available voice
          utterance.voice = voices[0]
        }
        
        // Configure speech
        utterance.rate = 0.9 // Slightly slower for clarity
        utterance.pitch = 1.1 // Slightly higher pitch (more natural)
        utterance.volume = 1
        utterance.lang = preferredVoice?.lang || 'en-US' // Set language
        
        // Start timer after question is read
        utterance.onend = () => {
          setIsReadingQuestion(false)
          speechSynthesisRef.current = null
          startTimerForQuestion(questionIndex)
        }
        
        utterance.onerror = (error: any) => {
          console.error('Speech synthesis error:', error)
          setIsReadingQuestion(false)
          speechSynthesisRef.current = null
          
          // Handle "not-allowed" error specifically
          if (error.error === 'not-allowed') {
            // Browser blocked autoplay - try to resume or just skip
            AlertModal.warning('Audio playback was blocked. Starting timer...', 2000)
          }
          
          // If speech fails, start timer anyway
          startTimerForQuestion(questionIndex)
        }
        
        speechSynthesisRef.current = utterance
        
        // Ensure voices are loaded before speaking
        const speakWithVoice = () => {
          // Double-check speech synthesis is not busy
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel()
            setTimeout(() => {
              const updatedVoices = window.speechSynthesis.getVoices()
              if (updatedVoices.length > 0) {
                const updatedPreferredVoice = getPreferredVoice()
                if (updatedPreferredVoice && !utterance.voice) {
                  utterance.voice = updatedPreferredVoice
                } else if (!utterance.voice && updatedVoices.length > 0) {
                  utterance.voice = updatedVoices[0]
                }
              }
              try {
                window.speechSynthesis.speak(utterance)
              } catch (speakError) {
                console.error('Error speaking:', speakError)
                setIsReadingQuestion(false)
                speechSynthesisRef.current = null
                startTimerForQuestion(questionIndex)
              }
            }, 100)
            return
          }
          
          const updatedVoices = window.speechSynthesis.getVoices()
          if (updatedVoices.length > 0) {
            const updatedPreferredVoice = getPreferredVoice()
            if (updatedPreferredVoice && !utterance.voice) {
              utterance.voice = updatedPreferredVoice
            } else if (!utterance.voice && updatedVoices.length > 0) {
              utterance.voice = updatedVoices[0]
            }
          }
          
          try {
            window.speechSynthesis.speak(utterance)
          } catch (speakError) {
            console.error('Error speaking:', speakError)
            setIsReadingQuestion(false)
            speechSynthesisRef.current = null
            startTimerForQuestion(questionIndex)
          }
        }
        
        if (voices.length === 0) {
          // Wait for voices to load
          const voicesHandler = () => {
            speakWithVoice()
            window.speechSynthesis.removeEventListener('voiceschanged', voicesHandler)
          }
          window.speechSynthesis.addEventListener('voiceschanged', voicesHandler)
          // Also try to get voices immediately (sometimes they're already loaded)
          const immediateVoices = window.speechSynthesis.getVoices()
          if (immediateVoices.length > 0) {
            window.speechSynthesis.removeEventListener('voiceschanged', voicesHandler)
            speakWithVoice()
          }
        } else {
          speakWithVoice()
        }
      } else {
        // If speech synthesis is not supported, start timer immediately
        setIsReadingQuestion(false)
        startTimerForQuestion(questionIndex)
      }
    }, 100) // Small delay to ensure previous speech is fully cancelled
  }

  // Update displayed answer when transcript changes (for real-time display)
  // The transcript is cumulative, so we combine baseAnswer + transcript
  const displayAnswer = listening ? (baseAnswer + (baseAnswer ? ' ' : '') + transcript).trim() : (answers[currentQuestionIndex] || '')

  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        // Safari
        await (document.documentElement as any).webkitRequestFullscreen()
        setIsFullscreen(true)
      } else if ((document.documentElement as any).msRequestFullscreen) {
        // IE/Edge
        await (document.documentElement as any).msRequestFullscreen()
        setIsFullscreen(true)
      }
    } catch (error) {
      console.error('Error entering fullscreen:', error)
      // Continue even if fullscreen fails
    }
  }

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
        setIsFullscreen(false)
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen()
        setIsFullscreen(false)
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('Error exiting fullscreen:', error)
    }
  }

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
    }
  }, [])

  const fetchQuestions = async (testId: string) => {
    setLoading(true)
    try {
      const response = await axios.get(`http://192.168.1.45:3000/question/${testId}`)
      
      if (response.data.success) {
        setDomain(response.data.data.tblDomainJobDescription_id.domain.domainName)
        setExperience(response.data.data.tblDomainJobDescription_id.required_exeperience)
        setQuestionsDictionary(response.data.data._id)
        const questionData = response.data.data.question
        // Handle both array and single question
        const questionsArray = Array.isArray(questionData) ? questionData : [questionData]
        setQuestions(questionsArray)
        // Initialize answers array with empty strings
        setAnswers(new Array(questionsArray.length).fill(''))
        setExamStarted(true)
        AlertModal.success('Exam started! Entering fullscreen mode...', 2000)
      } else {
        AlertModal.error(response.data.message || 'Failed to fetch questions', 5000)
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'An error occurred while fetching questions'
      AlertModal.error(errorMessage, 5000)
    } finally {
      setLoading(false)
    }
  }

  const startTimerForQuestion = (questionIndex: number) => {
    // Clear any existing timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)

    const question = questions[questionIndex]
    const timeInMinutes = question?.expected_time_minutes || 5
    const timeInSeconds = timeInMinutes * 20
    setTimeRemaining(timeInSeconds)

    // Update timer every second
    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Auto-advance when time is up
    timerRef.current = setTimeout(() => {
      handleNextQuestion()
    }, timeInSeconds * 1000)
  }

  const handleStopReading = () => {
    if (speechSynthesisRef.current) {
      window.speechSynthesis.cancel()
      setIsReadingQuestion(false)
      // Start timer if question reading was stopped
      if (currentQuestionIndex < questions.length) {
        startTimerForQuestion(currentQuestionIndex)
      }
    }
  }

  const handleAnswerChange = (value: string) => {
    // If not listening, update answer directly
    if (!listening) {
      setAnswers(prev => {
        const newAnswers = [...prev]
        newAnswers[currentQuestionIndex] = value
        return newAnswers
      })
      setBaseAnswer(value)
    } else {
      // If listening, update base answer (will be combined with transcript)
      setBaseAnswer(value)
    }
  }

  const handleStartListening = async () => {
    if (!browserSupportsSpeechRecognition) {
      AlertModal.warning('Speech recognition is not supported in your browser', 3000)
      return
    }
    
    // Check if we're on HTTPS or localhost (required for microphone access)
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1'
    
    if (!isSecure) {
      AlertModal.warning('Microphone access requires HTTPS or localhost. Please use a secure connection.', 5000)
      return
    }
    
    try {
      // Request microphone permission first
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop())
      } catch (permissionError: any) {
        console.error('Microphone permission error:', permissionError)
        if (permissionError.name === 'NotAllowedError' || permissionError.name === 'PermissionDeniedError') {
          AlertModal.error('Microphone permission denied. Please allow microphone access in your browser settings and try again.', 5000)
        } else if (permissionError.name === 'NotFoundError' || permissionError.name === 'DevicesNotFoundError') {
          AlertModal.error('No microphone found. Please connect a microphone and try again.', 5000)
        } else {
          AlertModal.error('Failed to access microphone. Please check your browser settings.', 5000)
        }
        return
      }
      
      // Save current answer as base before starting voice input
      const currentAnswer = answers[currentQuestionIndex] || ''
      setBaseAnswer(currentAnswer)
      resetTranscript()
      
      // Small delay to ensure transcript is reset
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Start listening with error handling
      try {
        SpeechRecognition.startListening({ 
          continuous: true,
          interimResults: true,
          language: 'en-US'
        })
        console.log('Speech recognition started successfully')
      } catch (startError: any) {
        console.error('Error calling startListening:', startError)
        AlertModal.error('Failed to start voice input. Please try again.', 3000)
      }
    } catch (error: any) {
      console.error('Error starting speech recognition:', error)
      AlertModal.error('Failed to start voice input. Please check your microphone permissions and try again.', 5000)
    }
  }

  const handleStopListening = () => {
    SpeechRecognition.stopListening()
    // Combine base answer with final transcript and save
    const finalAnswer = (baseAnswer + (baseAnswer && transcript ? ' ' : '') + transcript).trim()
    setAnswers(prev => {
      const newAnswers = [...prev]
      newAnswers[currentQuestionIndex] = finalAnswer
      return newAnswers
    })
    setBaseAnswer(finalAnswer)
    resetTranscript()
  }

  const handleNextQuestion = () => {
    // Stop listening if active and save the answer
    if (listening) {
      const finalAnswer = (baseAnswer + (baseAnswer && transcript ? ' ' : '') + transcript).trim()
      setAnswers(prev => {
        const newAnswers = [...prev]
        newAnswers[currentQuestionIndex] = finalAnswer
        return newAnswers
      })
      SpeechRecognition.stopListening()
      resetTranscript()
      setBaseAnswer('')
    } else {
      // Save current answer to array (even if empty)
      const currentAnswer = answers[currentQuestionIndex] || ''
      setAnswers(prev => {
        const newAnswers = [...prev]
        newAnswers[currentQuestionIndex] = currentAnswer || ''
        return newAnswers
      })
    }

    // Reset base answer for next question
    setBaseAnswer('')

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    } else {
      // Last question, submit exam
      handleSubmitExam()
    }
  }


  const handleSubmitExam = async () => {
    // Stop listening if active and save the answer
    if (listening) {
      const finalAnswer = (baseAnswer + (baseAnswer && transcript ? ' ' : '') + transcript).trim()
      setAnswers(prev => {
        const newAnswers = [...prev]
        newAnswers[currentQuestionIndex] = finalAnswer
        return newAnswers
      })
      SpeechRecognition.stopListening()
      resetTranscript()
      setBaseAnswer('')
    } else {
      // Save current answer before submitting
      const currentAnswer = answers[currentQuestionIndex] || ''
      setAnswers(prev => {
        const newAnswers = [...prev]
        newAnswers[currentQuestionIndex] = currentAnswer || ''
        return newAnswers
      })
    }

    // Exit fullscreen
    await exitFullscreen()

    // Clear timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)

    setSubmitting(true)
    try {
      const submissionData = {
        domain: domain,
        experience: String(experience),
        questions_with_answers: questions.map((question, index) => ({
          question_number: question._id || question.id || index,
          candidate_answer: answers[index] || '',
          question: question.question || question
        }))
      }

      const response = await axios.post('http://192.168.1.6:8000/evaluate-answers', submissionData)
      
      if (response.data.success) {
        await axios.post('http://192.168.1.45:3000/candidate-answer', {
          candidate_id: id,
          answer: response.data.evaluations,
          tblQuestionsDictionary_id: questionsDictionary,
          AnswerScore: response.data.total_marks,
        });
        AlertModal.success('Exam submitted successfully!', 2000);
        setTimeout(() => {
          navigate('/thank-you')
        }, 2000)
      } else {
        AlertModal.error(response.data.message || 'Failed to submit exam', 5000)
      }

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'An error occurred while submitting exam'
      AlertModal.error(errorMessage, 5000)
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const currentQuestion = questions[currentQuestionIndex]

  // Show start screen if exam hasn't started yet
  if (!examStarted && examReady) {
    return (
      <div className="test-container">
        <div className="start-exam-screen">
          <div className="start-exam-content">
            <h1 className="start-exam-title">Welcome to the Exam</h1>
            <div className="start-exam-info">
              <p className="info-text">Please read the following instructions carefully:</p>
              <ul className="instructions-list">
                <li>You will have a limited time for each question</li>
                <li>You can type your answer or use voice input</li>
                <li>The question will be read aloud automatically</li>
                <li>You cannot go back to previous questions</li>
                <li>Do not close the browser during the exam</li>
              </ul>
              <p className="ready-text">When you're ready, click the button below to start the exam.</p>
            </div>
            <button 
              className="start-exam-button"
              onClick={handleStartExam}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Start Exam'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return <Loader message="Loading exam questions..." />
  }

  if (questions.length === 0 && examStarted) {
    return (
      <div className="test-container">
        <div className="no-questions">
          <p>No questions available for this exam.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {submitting && <Loader message="Submitting exam..." />}
      <div className="test-container">
        <div className="exam-content">
          <div className="exam-header">
            <div className="exam-info">
              <h2 className="exam-title">Exam</h2>
              <p className="question-counter">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <div className="timer-container">
              {isReadingQuestion ? (
                <div className="timer reading-timer">
                  <span className="timer-label">Reading Question...</span>
                  <button 
                    className="stop-reading-button"
                    onClick={handleStopReading}
                    title="Stop reading and start timer"
                  >
                    Skip
                  </button>
                </div>
              ) : (
                <div className={`timer ${timeRemaining < 60 ? 'timer-warning' : ''}`}>
                  <span className="timer-label">Time Remaining:</span>
                  <span className="timer-value">{formatTime(timeRemaining)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="question-section">
            <div className="question-card">
              <h3 className="question-text">
                {currentQuestion?.question || `Question ${currentQuestionIndex + 1}`}
              </h3>
              
              <div className="answer-section">
                <label htmlFor="answer" className="answer-label">Your Answer:</label>
                <textarea
                  id="answer"
                  className="answer-textarea"
                  value={displayAnswer}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  placeholder="Type your answer here or use voice input..."
                  rows={5}
                />
                
                <div className="voice-controls">
                  {browserSupportsSpeechRecognition ? (
                    <>
                      {!listening ? (
                        <button
                          type="button"
                          className="voice-button start-voice"
                          onClick={handleStartListening}
                        >
                          🎤 Start Voice Input
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="voice-button stop-voice"
                          onClick={handleStopListening}
                        >
                          ⏹️ Stop Voice Input
                        </button>
                      )}
                      {listening && (
                        <span className="listening-indicator">🎤 Listening...</span>
                      )}
                    </>
                  ) : (
                    <p className="voice-not-supported">
                      Voice input is not supported in your browser
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="exam-navigation">
            {currentQuestionIndex < questions.length - 1 ? (
              <button
                type="button"
                className="nav-button next-button"
                onClick={handleNextQuestion}
              >
                Next Question →
              </button>
            ) : (
              <button
                type="button"
                className="nav-button submit-button"
                onClick={handleSubmitExam}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Exam'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Test
