/* eslint-disable */

import PythonAIService, { PythonAIConfig } from './pythonAI'

export interface ProctoringConfig {
  enableBrowserLockdown: boolean
  enableWebcam: boolean
  enableAudioMonitoring: boolean
  recordSessions: boolean
  pythonAI?: PythonAIConfig // Optional Python AI backend configuration
}

export interface SuspiciousActivity {
  type: 'tab_switch' | 'window_blur' | 'copy_paste' | 'right_click' | 'multiple_faces' | 'face_not_detected' | 'audio_detected' | 'person_left_seat' | 'looking_away'
  timestamp: number
  severity: 'low' | 'medium' | 'high'
  description: string
}

export interface ProctoringState {
  isMonitoring: boolean
  webcamActive: boolean
  audioMonitoringActive: boolean
  suspiciousActivities: SuspiciousActivity[]
  violations: number
}

class ProctoringService {
  private config: ProctoringConfig
  private state: ProctoringState
  private callbacks: {
    onSuspiciousActivity?: (activity: SuspiciousActivity) => void
    onViolation?: (count: number) => void
  } = {}

  // Media streams
  private webcamStream: MediaStream | null = null
  private audioStream: MediaStream | null = null

  // Recording
  private webcamRecorder: MediaRecorder | null = null
  private audioRecorder: MediaRecorder | null = null

  // AI Models
  private faceDetector: any = null
  private isModelLoaded: boolean = false
  
  // Python AI Service (optional)
  private pythonAI: PythonAIService | null = null

  // Video elements for face detection
  private webcamVideo: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private faceDetectionInterval: ReturnType<typeof setInterval> | null = null

  // Audio analysis
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private audioDataArray: Uint8Array | null = null
  private audioMonitoringInterval: ReturnType<typeof setInterval> | null = null

  // Activity tracking
  private lastFocusTime: number = Date.now()
  private tabSwitchCount: number = 0
  private faceDetectionCount: number = 0
  private noFaceCount: number = 0
  private lastFaceDetected: number = Date.now()
  private lastFacePosition: { x: number; y: number } | null = null
  private lookingAwayCount: number = 0
  
  // Audio voice detection
  private baselineAudioLevel: number = 0
  private baselineAudioFreq: number[] = []
  private studentVoiceProfile: { 
    avgFreq: number; 
    dominantFreq: number;
    freqRange?: { min: number; max: number }; // Learned frequency range
  } | null = null
  private audioSampleCount: number = 0
  private lastAudioAlertTime: number = 0
  private audioAlertCooldown: number = 5000 // 5 seconds cooldown between alerts
  private speechRecognitionActive: boolean = false // Track if speech-to-text is active

  constructor(config: ProctoringConfig) {
    this.config = config
    this.state = {
      isMonitoring: false,
      webcamActive: false,
      audioMonitoringActive: false,
      suspiciousActivities: [],
      violations: 0
    }
  }

  // Initialize proctoring
  async startMonitoring(
    onSuspiciousActivity?: (activity: SuspiciousActivity) => void,
    onViolation?: (count: number) => void
  ): Promise<void> {
    this.callbacks.onSuspiciousActivity = onSuspiciousActivity
    this.callbacks.onViolation = onViolation
    this.state.isMonitoring = true

    try {
      // Start browser lockdown
      if (this.config.enableBrowserLockdown) {
        this.setupBrowserLockdown()
      }

      // Initialize Python AI service if configured
      if (this.config.pythonAI?.enabled) {
        this.pythonAI = new PythonAIService(this.config.pythonAI)
        await this.pythonAI.start()
      }

      // Load AI models first (browser-based)
      if (this.config.enableWebcam) {
        await this.loadAIModels()
      }

      // Start webcam monitoring
      if (this.config.enableWebcam) {
        await this.startWebcamMonitoring()
      }

      // Start audio monitoring
      if (this.config.enableAudioMonitoring) {
        await this.startAudioMonitoring()
      }

      // Setup visibility change detection
      this.setupVisibilityDetection()

      console.log('✅ Proctoring started successfully')
      console.log('Final state:', {
        webcamActive: this.state.webcamActive,
        audioMonitoringActive: this.state.audioMonitoringActive,
        isMonitoring: this.state.isMonitoring
      })
    } catch (error) {
      console.error('❌ Error starting proctoring:', error)
      // Don't throw - allow exam to continue even if some features fail
      console.warn('Continuing with partial proctoring features')
    }
  }

  // Browser Lockdown
  private setupBrowserLockdown(): void {
    // Disable right-click context menu
    document.addEventListener('contextmenu', this.handleRightClick)

    // Disable copy/paste shortcuts
    document.addEventListener('keydown', this.handleKeyboardShortcuts)

    // Disable text selection (optional - can be commented if needed)
    document.addEventListener('selectstart', this.handleTextSelection)

    // Disable drag and drop
    document.addEventListener('dragstart', this.handleDragStart)
    document.addEventListener('drop', this.handleDrop)
  }

  private handleRightClick = (e: MouseEvent): void => {
    e.preventDefault()
    this.recordSuspiciousActivity({
      type: 'right_click',
      timestamp: Date.now(),
      severity: 'medium',
      description: 'Right-click detected - context menu disabled'
    })
  }

  private handleKeyboardShortcuts = (e: KeyboardEvent): void => {
    // Disable Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X, Ctrl+S, Ctrl+P, F12, Ctrl+Shift+I
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === 'c' || e.key === 'v' || e.key === 'a' || e.key === 'x' || 
       e.key === 's' || e.key === 'p' || e.key === 'u')
    ) {
      e.preventDefault()
      this.recordSuspiciousActivity({
        type: 'copy_paste',
        timestamp: Date.now(),
        severity: 'high',
        description: `Keyboard shortcut detected: ${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${e.key.toUpperCase()}`
      })
    }

    // Disable F12 (Developer Tools)
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
      e.preventDefault()
      this.recordSuspiciousActivity({
        type: 'copy_paste',
        timestamp: Date.now(),
        severity: 'high',
        description: 'Developer tools access attempt detected'
      })
    }

    // Disable Print Screen
    if (e.key === 'PrintScreen') {
      e.preventDefault()
      this.recordSuspiciousActivity({
        type: 'copy_paste',
        timestamp: Date.now(),
        severity: 'medium',
        description: 'Print Screen attempt detected'
      })
    }
  }

  private handleTextSelection = (e: Event): void => {
    // Allow text selection for typing answers, but log it
    // Uncomment below to completely disable selection:
    // e.preventDefault()
  }

  private handleDragStart = (e: DragEvent): void => {
    e.preventDefault()
  }

  private handleDrop = (e: DragEvent): void => {
    e.preventDefault()
  }

  // Visibility Detection (Tab Switch/Window Blur)
  private setupVisibilityDetection(): void {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener('focus', this.handleWindowFocus)
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.tabSwitchCount++
      this.recordSuspiciousActivity({
        type: 'tab_switch',
        timestamp: Date.now(),
        severity: 'high',
        description: 'Tab switch or window minimized detected'
      })
    }
  }

  private handleWindowBlur = (): void => {
    this.recordSuspiciousActivity({
      type: 'window_blur',
      timestamp: Date.now(),
      severity: 'high',
      description: 'Browser window lost focus - possible application switch'
    })
  }

  private handleWindowFocus = (): void => {
    this.lastFocusTime = Date.now()
  }

  // Restart webcam stream if it stops
  private async restartWebcamStream(): Promise<void> {
    try {
      console.log('Attempting to restart webcam stream...')
      
      // Stop old stream if exists
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach(track => track.stop())
      }
      
      // Request new stream
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      })
      
      // Update video element
      if (this.webcamVideo) {
        this.webcamVideo.srcObject = this.webcamStream
        await this.webcamVideo.play()
        console.log('Webcam stream restarted successfully')
      }
    } catch (error: any) {
      console.error('Failed to restart webcam stream:', error)
    }
  }

  // Webcam Monitoring - COMPLETELY NEW APPROACH
  private async startWebcamMonitoring(): Promise<void> {
    try {
      console.log('Requesting webcam access...')
      await this.initializeWebcam()
      
      // Start watchdog that recreates camera if it dies
      this.startWebcamWatchdog()
      
      this.state.webcamActive = true
      console.log('✅ Webcam monitoring started successfully')
      console.log('Webcam active state:', this.state.webcamActive)
      console.log('Stream active:', this.webcamStream?.active)
    } catch (error: any) {
      console.error('❌ Error starting webcam:', error)
      this.state.webcamActive = false
      console.warn('Continuing without webcam monitoring')
    }
  }

  // Initialize webcam - SIMPLE AND DIRECT
  private async initializeWebcam(): Promise<void> {
    try {
      // Request webcam access
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      })
      console.log('✅ Webcam stream obtained')

      // Remove old video if exists
      if (this.webcamVideo) {
        try {
          if (this.webcamVideo.parentNode) {
            this.webcamVideo.parentNode.removeChild(this.webcamVideo)
          }
        } catch (e) {
          // Ignore
        }
      }

      // Create video element
      this.webcamVideo = document.createElement('video')
      this.webcamVideo.srcObject = this.webcamStream
      this.webcamVideo.autoplay = true
      this.webcamVideo.playsInline = true
      this.webcamVideo.muted = true
      this.webcamVideo.setAttribute('id', 'proctoring-webcam-preview')
      this.webcamVideo.setAttribute('class', 'proctoring-webcam-preview')
      
      // Style
      Object.assign(this.webcamVideo.style, {
        position: 'fixed',
        top: '50px',
        right: '20px',
        width: '200px',
        height: '150px',
        border: '3px solid #646cff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: '9999',
        backgroundColor: '#000',
        objectFit: 'cover'
      })
      
      document.body.appendChild(this.webcamVideo)

      // Create label
      let labelContainer = document.getElementById('proctoring-webcam-label')
      if (!labelContainer) {
        labelContainer = document.createElement('div')
        labelContainer.setAttribute('id', 'proctoring-webcam-label')
        Object.assign(labelContainer.style, {
          position: 'fixed',
          top: '20px',
          right: '20px',
          width: '200px',
          padding: '4px 8px',
          background: 'linear-gradient(135deg, #646cff 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: '12px 12px 0 0',
          fontSize: '0.7rem',
          fontWeight: '600',
          textAlign: 'center',
          zIndex: '10000'
        })
        document.body.appendChild(labelContainer)
      }
      labelContainer.textContent = '📹 Camera Monitoring'

      // Wait and play
      await new Promise<void>((resolve) => {
        const playVideo = () => {
          if (this.webcamVideo) {
            this.webcamVideo.play()
              .then(() => {
                console.log('✅ Video is playing')
                resolve()
              })
              .catch(() => {
                // Retry after a bit
                setTimeout(playVideo, 100)
              })
          }
        }
        
        if (this.webcamVideo.readyState >= 2) {
          playVideo()
        } else {
          this.webcamVideo.onloadedmetadata = playVideo
          // Also try immediately
          setTimeout(playVideo, 100)
        }
      })

      // Start recording if enabled
      if (this.config.recordSessions) {
        this.startWebcamRecording()
      }

      // Start face detection
      this.startFaceDetection()
    } catch (error: any) {
      console.error('Failed to initialize webcam:', error)
      throw error
    }
  }

  // ULTRA-SIMPLE WATCHDOG - Just keep playing the video, NO MATTER WHAT
  private startWebcamWatchdog(): void {
    let watchdogRunning = true
    
    const watchdog = async () => {
      // Only check watchdogRunning, not isMonitoring (which might be set to false incorrectly)
      if (!watchdogRunning) {
        console.log('Watchdog stopped by flag')
        return
      }
      
      // Check if monitoring should be active (but don't stop if it's false - might be a bug)
      if (!this.state.isMonitoring) {
        console.warn('⚠️ isMonitoring is false, but watchdog continues to run')
        // Don't return - keep the camera alive even if isMonitoring is false
      }

      try {
        // If video element doesn't exist or not in DOM, recreate everything
        if (!this.webcamVideo || !this.webcamVideo.parentNode) {
          console.error('❌ Video missing! Recreating...')
          try {
            await this.initializeWebcam()
            console.log('✅ Webcam recreated')
          } catch (err) {
            console.error('Recreate failed:', err)
          }
          setTimeout(watchdog, 500)
          return
        }

        // ALWAYS try to play - FORCE IT
        if (this.webcamVideo) {
          // Check if paused/ended and force play
          if (this.webcamVideo.paused || this.webcamVideo.ended) {
            console.warn('⚠️ Video paused/ended, FORCING play...')
            try {
              await this.webcamVideo.play()
              console.log('✅ Video forced to play')
            } catch (playErr) {
              console.error('❌ Play failed:', playErr)
              // If play fails, recreate immediately
              try {
                await this.initializeWebcam()
                console.log('✅ Webcam recreated after play failure')
              } catch (e) {
                console.error('Recreate failed:', e)
              }
            }
          } else {
            // Even if playing, call play() again to ensure it stays playing
            this.webcamVideo.play().catch(() => {
              // Silent fail - just try again next cycle
            })
          }
        }

        // Check stream
        if (!this.webcamStream || !this.webcamStream.active) {
          console.error('❌ Stream dead! Recreating...')
          try {
            await this.initializeWebcam()
            console.log('✅ Stream recreated')
          } catch (e) {
            console.error('Recreate failed:', e)
          }
          setTimeout(watchdog, 500)
          return
        }

        // Check track
        const tracks = this.webcamStream.getVideoTracks()
        if (tracks.length === 0 || tracks[0].readyState === 'ended') {
          console.error('❌ Track dead! Recreating...')
          try {
            await this.initializeWebcam()
            console.log('✅ Track recreated')
          } catch (e) {
            console.error('Recreate failed:', e)
          }
          setTimeout(watchdog, 500)
          return
        }

        // Re-enable track if disabled
        if (tracks[0] && !tracks[0].enabled) {
          console.warn('⚠️ Track disabled, re-enabling...')
          tracks[0].enabled = true
        }

      // Ensure track never stops - PROTECT IT
      if (tracks[0]) {
        // Override stop method to prevent stopping
        if (!(tracks[0] as any)._stopProtected) {
          const originalStop = tracks[0].stop.bind(tracks[0])
          ;(tracks[0] as any)._originalStop = originalStop
          tracks[0].stop = () => {
            console.warn('🚨 BLOCKED: Attempt to stop video track was blocked!')
            // Don't actually stop - just log it
            // Re-enable the track if it was disabled
            if (!tracks[0].enabled) {
              tracks[0].enabled = true
            }
          }
          ;(tracks[0] as any)._stopProtected = true
        }
        
        // Also protect the video element from being paused
        if (this.webcamVideo && !(this.webcamVideo as any)._pauseProtected) {
          const originalPause = this.webcamVideo.pause.bind(this.webcamVideo)
          ;(this.webcamVideo as any)._originalPause = originalPause
          this.webcamVideo.pause = () => {
            console.warn('🚨 BLOCKED: Attempt to pause video was blocked!')
            // Don't actually pause - force play instead
            this.webcamVideo?.play().catch(() => {
              // If play fails, recreate
              this.initializeWebcam().catch(e => console.error('Recreate failed:', e))
            })
          }
          ;(this.webcamVideo as any)._pauseProtected = true
        }
      }
      } catch (error) {
        console.error('Watchdog error:', error)
      }

      // Check again in 100ms - EXTREMELY FREQUENT
      setTimeout(watchdog, 100)
    }

    // Start immediately
    watchdog()
    
    // Store watchdog stop function
    ;(this as any).stopWatchdog = () => {
      watchdogRunning = false
    }
  }

  private startWebcamRecording(): void {
    if (!this.webcamStream) return

    try {
      const chunks: Blob[] = []
      this.webcamRecorder = new MediaRecorder(this.webcamStream, {
        mimeType: 'video/webm;codecs=vp8'
      })

      this.webcamRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      this.webcamRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        // In production, upload this blob to your server
        console.log('Webcam recording stopped, blob size:', blob.size)
        // Example: uploadRecording(blob, 'webcam')
      }

      this.webcamRecorder.start(1000) // Collect data every second
    } catch (error) {
      console.error('Error starting webcam recording:', error)
    }
  }

  // AI-powered face detection using TensorFlow.js
  private startFaceDetection(): void {
    if (!this.webcamVideo) {
      console.error('Cannot start face detection: webcam video not available')
      return
    }

    // Check if video is actually playing
    if (this.webcamVideo.paused || this.webcamVideo.readyState < 2) {
      console.warn('Webcam video not ready, waiting...', {
        paused: this.webcamVideo.paused,
        ended: this.webcamVideo.ended,
        readyState: this.webcamVideo.readyState,
        videoWidth: this.webcamVideo.videoWidth,
        videoHeight: this.webcamVideo.videoHeight
      })
      // Try again after a delay
      setTimeout(() => {
        if (this.webcamVideo && !this.webcamVideo.paused && this.webcamVideo.readyState >= 2) {
          console.log('Video is now ready, starting face detection')
          this.startFaceDetection()
        } else {
          console.warn('Video still not ready after delay')
        }
      }, 2000)
      return
    }
    
    console.log('Video is ready for face detection:', {
      videoWidth: this.webcamVideo.videoWidth,
      videoHeight: this.webcamVideo.videoHeight,
      readyState: this.webcamVideo.readyState,
      paused: this.webcamVideo.paused
    })

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.webcamVideo.videoWidth || 640
    this.canvas.height = this.webcamVideo.videoHeight || 480
    const ctx = this.canvas.getContext('2d')

    if (!ctx) {
      console.error('Cannot get canvas context for face detection')
      return
    }

    console.log('✅ Starting face detection with canvas size:', this.canvas.width, 'x', this.canvas.height)
    console.log('✅ AI model loaded:', this.isModelLoaded)
    console.log('✅ Video dimensions:', this.webcamVideo.videoWidth, 'x', this.webcamVideo.videoHeight)

    let detectionCount = 0
    this.faceDetectionInterval = setInterval(async () => {
      if (!this.webcamVideo || !this.canvas || !ctx) {
        console.warn('Face detection: Missing video, canvas, or context')
        return
      }

      // Check if video is still playing and stream is active
      if (this.webcamVideo.paused || this.webcamVideo.ended) {
        console.warn('Webcam video paused or ended, attempting to resume...')
        // Try to resume if paused
        if (this.webcamVideo.paused && !this.webcamVideo.ended) {
          this.webcamVideo.play().catch(err => console.warn('Failed to resume video:', err))
        }
        return
      }
      
      // Check if stream is still active
      if (this.webcamStream && !this.webcamStream.active) {
        console.warn('Webcam stream is not active')
        return
      }
      
      // Check if video track is still enabled
      const checkVideoTracks = this.webcamStream?.getVideoTracks()
      if (checkVideoTracks && checkVideoTracks.length > 0 && !checkVideoTracks[0].enabled) {
        console.warn('Video track is disabled, re-enabling...')
        checkVideoTracks[0].enabled = true
      }

      detectionCount++
      if (detectionCount % 10 === 0) {
        console.log(`✅ Face detection running... (${detectionCount} cycles, faces detected: ${this.faceDetectionCount})`)
      }

      try {
        // Use actual video dimensions
        const width = this.webcamVideo.videoWidth || this.canvas.width
        const height = this.webcamVideo.videoHeight || this.canvas.height
        this.canvas.width = width
        this.canvas.height = height
        
        ctx.drawImage(this.webcamVideo, 0, 0, width, height)
        
        // Try Python AI first if available, then browser-based AI, then fallback
        if (this.pythonAI) {
          const pythonResult = await this.pythonAI.analyzeVideoFrame(this.canvas)
          if (pythonResult) {
            // Use Python AI results
            if (pythonResult.facesDetected === 0) {
              this.noFaceCount++
              if (this.noFaceCount > 10) {
                this.recordSuspiciousActivity({
                  type: 'face_not_detected',
                  timestamp: Date.now(),
                  severity: 'medium',
                  description: 'Face not detected in frame - student may have left seat or covered camera'
                })
                this.noFaceCount = 0
              }
            } else {
              this.faceDetectionCount++
              this.lastFaceDetected = Date.now()
              this.noFaceCount = 0
              
              if (pythonResult.multipleFaces) {
                this.recordSuspiciousActivity({
                  type: 'multiple_faces',
                  timestamp: Date.now(),
                  severity: 'high',
                  description: 'Multiple faces detected - possible unauthorized person in frame'
                })
              }
              
              if (pythonResult.lookingAway) {
                this.lookingAwayCount++
                if (this.lookingAwayCount > 5) {
                  this.recordSuspiciousActivity({
                    type: 'looking_away',
                    timestamp: Date.now(),
                    severity: 'medium',
                    description: 'Person appears to be looking away from screen repeatedly'
                  })
                  this.lookingAwayCount = 0
                }
              } else {
                this.lookingAwayCount = 0
              }
              
              if (pythonResult.personLeftSeat) {
                this.recordSuspiciousActivity({
                  type: 'person_left_seat',
                  timestamp: Date.now(),
                  severity: 'high',
                  description: 'Person may have left seat'
                })
              }
            }
          } else {
            // Python AI failed, fall back to browser-based detection
            if (this.isModelLoaded && this.faceDetector) {
              await this.detectFacesWithAI(this.canvas)
            } else {
              // Fallback to basic detection
              const imageData = ctx.getImageData(0, 0, width, height)
              const faceDetected = this.detectFacePresence(imageData)
              
              if (faceDetected) {
                this.faceDetectionCount++
                this.lastFaceDetected = Date.now()
                this.noFaceCount = 0
              } else {
                this.noFaceCount++
                if (this.noFaceCount > 25) {
                  this.recordSuspiciousActivity({
                    type: 'face_not_detected',
                    timestamp: Date.now(),
                    severity: 'medium',
                    description: 'Face not detected in frame - student may have left seat or covered camera'
                  })
                  this.noFaceCount = 0
                }
              }
            }
          }
        } else {
          // No Python AI, use browser-based detection
          if (this.isModelLoaded && this.faceDetector) {
            await this.detectFacesWithAI(this.canvas)
          } else {
            // Fallback to basic detection
            const imageData = ctx.getImageData(0, 0, width, height)
            const faceDetected = this.detectFacePresence(imageData)
            
            if (faceDetected) {
              this.faceDetectionCount++
              this.lastFaceDetected = Date.now()
              this.noFaceCount = 0
              
              // Log periodically to confirm detection is working
              if (this.faceDetectionCount % 20 === 0) {
                console.log(`✅ Face detected (${this.faceDetectionCount} detections)`)
              }
            } else {
              this.noFaceCount++
              if (this.noFaceCount > 25) {
                console.warn('⚠️ Face not detected for 5+ seconds')
                this.recordSuspiciousActivity({
                  type: 'face_not_detected',
                  timestamp: Date.now(),
                  severity: 'medium',
                  description: 'Face not detected in frame - student may have left seat or covered camera'
                })
                this.noFaceCount = 0
              }
            }
          }
        }
      } catch (error) {
        console.error('Face detection error:', error)
      }
    }, 500) // Check every 500ms (AI models need more time)
  }

  // AI-powered face detection
  private async detectFacesWithAI(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.faceDetector) return

    try {
      const faces = await this.faceDetector.estimateFaces(canvas, {
        flipHorizontal: false,
        staticImageMode: false
      })

      if (faces.length === 0) {
        // No face detected
        this.noFaceCount++
        if (this.noFaceCount > 10) { // 10 * 500ms = 5 seconds
          this.recordSuspiciousActivity({
            type: 'face_not_detected',
            timestamp: Date.now(),
            severity: 'medium',
            description: 'Face not detected in frame - student may have left seat or covered camera'
          })
          this.noFaceCount = 0
        }
        this.lastFaceDetected = 0
        return
      }

      // Face detected
      this.faceDetectionCount++
      this.lastFaceDetected = Date.now()
      this.noFaceCount = 0

      // Log face detection periodically
      if (this.faceDetectionCount % 20 === 0) {
        console.log(`✅ Face detected! (${this.faceDetectionCount} total detections, ${faces.length} face(s) in frame)`)
      }

      // Check for multiple faces
      if (faces.length > 1) {
        console.warn('⚠️ Multiple faces detected!', faces.length)
        this.recordSuspiciousActivity({
          type: 'multiple_faces',
          timestamp: Date.now(),
          severity: 'high',
          description: `Multiple faces detected (${faces.length}) - possible unauthorized person in frame`
        })
      }

      // Analyze face position and orientation for suspicious behavior
      const face = faces[0]
      if (face.keypoints && face.keypoints.length > 0) {
        // MediaPipe Face Mesh returns 468 keypoints as an array
        // Key landmark indices: nose tip (1), left eye center (33), right eye center (263)
        const nose = face.keypoints[1] // Nose tip
        const leftEye = face.keypoints[33] // Left eye center
        const rightEye = face.keypoints[263] // Right eye center

        if (nose && leftEye && rightEye) {
          // Calculate face center using nose position
          const faceCenterX = nose.x
          const faceCenterY = nose.y

          // Track face position changes (person moving away)
          // Only track after we have a stable baseline (skip first few detections)
          if (this.lastFacePosition && this.faceDetectionCount > 5) {
            const distance = Math.sqrt(
              Math.pow(faceCenterX - this.lastFacePosition.x, 2) +
              Math.pow(faceCenterY - this.lastFacePosition.y, 2)
            )

            // Fixed pixel thresholds
            const HEAD_SHAKE_THRESHOLD = 180 // px - student shaking head too much
            const LEFT_SEAT_THRESHOLD = 250 // px - student left the seat
            
            // Log movement for debugging
            if (this.faceDetectionCount % 20 === 0) {
              console.log(`📍 Face position: (${faceCenterX.toFixed(1)}, ${faceCenterY.toFixed(1)}), Distance: ${distance.toFixed(1)}px`)
            }
            
            // Check for student left seat (more than 250px)
            if (distance > LEFT_SEAT_THRESHOLD) {
              console.warn('⚠️ Student left the seat detected!', { 
                distance: distance.toFixed(1), 
                threshold: LEFT_SEAT_THRESHOLD,
                from: `(${this.lastFacePosition.x.toFixed(1)}, ${this.lastFacePosition.y.toFixed(1)})`,
                to: `(${faceCenterX.toFixed(1)}, ${faceCenterY.toFixed(1)})`
              })
              this.recordSuspiciousActivity({
                type: 'person_left_seat',
                timestamp: Date.now(),
                severity: 'high',
                description: `Student left the seat - significant face movement detected (${distance.toFixed(0)}px)`
              })
            }
            // Check for head shaking (more than 180px but less than 250px)
            else if (distance > HEAD_SHAKE_THRESHOLD) {
              console.warn('⚠️ Student shaking head too much detected:', { 
                distance: distance.toFixed(1), 
                threshold: HEAD_SHAKE_THRESHOLD,
                from: `(${this.lastFacePosition.x.toFixed(1)}, ${this.lastFacePosition.y.toFixed(1)})`,
                to: `(${faceCenterX.toFixed(1)}, ${faceCenterY.toFixed(1)})`
              })
              this.recordSuspiciousActivity({
                type: 'person_left_seat',
                timestamp: Date.now(),
                severity: 'medium',
                description: `Student shaking head too much - significant face movement detected (${distance.toFixed(0)}px)`
              })
            }
          }

          // Update position - track from the start for better movement detection
          if (!this.lastFacePosition) {
            // Set initial position on first detection
            this.lastFacePosition = { x: faceCenterX, y: faceCenterY }
            console.log(`📍 Initial face position set: (${faceCenterX.toFixed(1)}, ${faceCenterY.toFixed(1)})`)
          } else if (this.faceDetectionCount > 3) {
            // Update position after a few detections (allow for stabilization)
            this.lastFacePosition = { x: faceCenterX, y: faceCenterY }
          }

          // Detect if person is looking away (eye position analysis)
          const eyeDistance = Math.abs(leftEye.x - rightEye.x)
          const eyeCenterX = (leftEye.x + rightEye.x) / 2
          const deviation = Math.abs(eyeCenterX - faceCenterX)

          // If eyes are significantly off-center, person might be looking away
          if (deviation > eyeDistance * 0.3) {
            this.lookingAwayCount++
            if (this.lookingAwayCount > 5) {
              this.recordSuspiciousActivity({
                type: 'looking_away',
                timestamp: Date.now(),
                severity: 'medium',
                description: 'Person appears to be looking away from screen repeatedly'
              })
              this.lookingAwayCount = 0
            }
          } else {
            this.lookingAwayCount = 0
          }
        }
      }
    } catch (error) {
      console.error('AI face detection error:', error)
    }
  }

  // Fallback: Simplified face presence detection
  private detectFacePresence(imageData: ImageData): boolean {
    const data = imageData.data
    let skinPixels = 0
    const totalPixels = imageData.width * imageData.height

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      if (
        r > 95 && r < 255 &&
        g > 40 && g < 255 &&
        b > 20 && b < 255 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 &&
        r > g && r > b
      ) {
        skinPixels++
      }
    }

    return (skinPixels / totalPixels) > 0.05
  }

  // Load AI Models for face detection
  private async loadAIModels(): Promise<void> {
    try {
      console.log('Loading AI models...')
      
      // Dynamically import TensorFlow.js to avoid bundle size issues
      const tfModule = await import('@tensorflow/tfjs')
      const faceModule = await import('@tensorflow-models/face-landmarks-detection')
      
      console.log('TensorFlow module keys:', Object.keys(tfModule))
      console.log('Face module keys:', Object.keys(faceModule))
      
      // Load TensorFlow.js backend - handle different import formats
      const tf = (tfModule as any).default || tfModule
      if (tf && typeof tf.ready === 'function') {
        await tf.ready()
        console.log('TensorFlow.js backend ready')
      } else {
        console.warn('TensorFlow ready() not available, continuing anyway')
      }
      
      // Load face landmarks detection model
      // Access SupportedModels correctly
      const SupportedModels = (faceModule as any).SupportedModels || (faceModule as any).default?.SupportedModels
      const createDetector = (faceModule as any).createDetector || (faceModule as any).default?.createDetector
      
      if (!SupportedModels) {
        throw new Error('SupportedModels not found in face module')
      }
      
      if (!createDetector) {
        throw new Error('createDetector function not found')
      }
      
      const model = SupportedModels.MediaPipeFaceMesh
      if (!model) {
        throw new Error('MediaPipeFaceMesh model not found')
      }
      
      console.log('Using model:', model)
      
      const detectorConfig = {
        runtime: 'mediapipe' as const,
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        refineLandmarks: true,
        maxFaces: 2 // Detect up to 2 faces (to detect multiple people)
      }
      
      console.log('Creating detector with config:', detectorConfig)
      this.faceDetector = await createDetector(model, detectorConfig)
      this.isModelLoaded = true

      console.log('✅ AI models loaded successfully')
    } catch (error: any) {
      console.error('❌ Error loading AI models:', error)
      console.error('Error stack:', error.stack)
      // Continue without AI models, fallback to basic detection
      this.isModelLoaded = false
      console.warn('Continuing with basic face detection (no AI models)')
    }
  }

  // Audio Monitoring
  private async startAudioMonitoring(): Promise<void> {
    try {
      console.log('🎤 Requesting microphone access...')
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      console.log('✅ Audio stream obtained:', this.audioStream)
      console.log('✅ Audio tracks:', this.audioStream.getAudioTracks().length)
      if (this.audioStream.getAudioTracks().length > 0) {
        const track = this.audioStream.getAudioTracks()[0]
        console.log('✅ Audio track settings:', track.getSettings())
        console.log('✅ Audio track state:', {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          label: track.label
        })
        
        // Protect audio track from being stopped
        if (!(track as any)._stopProtected) {
          const originalStop = track.stop.bind(track)
          ;(track as any)._originalStop = originalStop
          track.stop = () => {
            console.warn('🚨 BLOCKED: Attempt to stop audio track was blocked!')
            // Don't actually stop - just log it
            // Re-enable the track if it was disabled
            if (!track.enabled) {
              track.enabled = true
            }
          }
          ;(track as any)._stopProtected = true
        }
      }

      // Setup audio analysis
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Resume audio context if suspended (required for some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
        console.log('✅ Audio context resumed')
      }
      
      const source = this.audioContext.createMediaStreamSource(this.audioStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8
      source.connect(this.analyser)

      this.audioDataArray = new Uint8Array(this.analyser.frequencyBinCount)

      // Start recording if enabled
      if (this.config.recordSessions) {
        this.startAudioRecording()
      }

      // Start audio level monitoring
      this.startAudioLevelMonitoring()
      
      // Start audio watchdog to keep it alive
      this.startAudioWatchdog()

      this.state.audioMonitoringActive = true
      console.log('✅ Audio monitoring started successfully')
      console.log('✅ Audio stream active:', this.audioStream.active)
      console.log('✅ Audio tracks:', this.audioStream.getAudioTracks().length)
      console.log('✅ Audio context state:', this.audioContext.state)
      console.log('✅ Audio monitoring active state:', this.state.audioMonitoringActive)
    } catch (error: any) {
      console.error('❌ Error starting audio monitoring:', error)
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        constraint: error.constraint
      })
      // Don't throw - allow exam to continue without audio monitoring
      this.state.audioMonitoringActive = false
      console.warn('Continuing without audio monitoring')
    }
  }
  
  // Audio watchdog to keep stream alive
  private startAudioWatchdog(): void {
    let watchdogRunning = true
    
    const watchdog = async () => {
      if (!watchdogRunning) {
        return
      }
      
      try {
        // Check if audio stream exists and is active
        if (!this.audioStream || !this.audioStream.active) {
          console.error('❌ Audio stream dead! Recreating...')
          try {
            // Save the existing interval to restore it
            const existingInterval = this.audioMonitoringInterval
            await this.startAudioMonitoring()
            // Restore interval if it was cleared
            if (!this.audioMonitoringInterval && existingInterval) {
              console.log('⚠️ Audio interval was cleared, restarting...')
              this.startAudioLevelMonitoring()
            }
            console.log('✅ Audio stream recreated')
          } catch (e) {
            console.error('Recreate failed:', e)
          }
          setTimeout(watchdog, 1000)
          return
        }
        
        // Check audio tracks
        const tracks = this.audioStream.getAudioTracks()
        if (tracks.length === 0 || tracks[0].readyState === 'ended') {
          console.error('❌ Audio track dead! Recreating...')
          try {
            // Save the existing interval to restore it
            const existingInterval = this.audioMonitoringInterval
            await this.startAudioMonitoring()
            // Restore interval if it was cleared
            if (!this.audioMonitoringInterval && existingInterval) {
              console.log('⚠️ Audio interval was cleared, restarting...')
              this.startAudioLevelMonitoring()
            }
            console.log('✅ Audio track recreated')
          } catch (e) {
            console.error('Recreate failed:', e)
          }
          setTimeout(watchdog, 1000)
          return
        }
        
        // Check if monitoring interval is still running
        if (!this.audioMonitoringInterval) {
          console.warn('⚠️ Audio monitoring interval missing! Restarting...')
          this.startAudioLevelMonitoring()
        }
        
        // Re-enable track if disabled
        if (tracks[0] && !tracks[0].enabled) {
          console.warn('⚠️ Audio track disabled, re-enabling...')
          tracks[0].enabled = true
        }
        
        // Check audio context state
        if (this.audioContext && this.audioContext.state === 'suspended') {
          console.warn('⚠️ Audio context suspended, resuming...')
          try {
            await this.audioContext.resume()
            console.log('✅ Audio context resumed')
          } catch (e) {
            console.error('Failed to resume audio context:', e)
          }
        }
      } catch (error) {
        console.error('Audio watchdog error:', error)
      }
      
      // Check again in 500ms
      setTimeout(watchdog, 500)
    }
    
    // Start immediately
    watchdog()
    
    // Store watchdog stop function
    ;(this as any).stopAudioWatchdog = () => {
      watchdogRunning = false
    }
  }

  private startAudioRecording(): void {
    if (!this.audioStream) return

    try {
      const chunks: Blob[] = []
      this.audioRecorder = new MediaRecorder(this.audioStream, {
        mimeType: 'audio/webm'
      })

      this.audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      this.audioRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        // In production, upload this blob to your server
        console.log('Audio recording stopped, blob size:', blob.size)
        // Example: uploadRecording(blob, 'audio')
      }

      this.audioRecorder.start(1000) // Collect data every second
    } catch (error) {
      console.error('Error starting audio recording:', error)
    }
  }

  private startAudioLevelMonitoring(): void {
    if (!this.analyser || !this.audioDataArray) {
      console.error('Cannot start audio monitoring: analyser or audioDataArray not available')
      return
    }

    // Clear existing interval if it exists (to prevent duplicates)
    if (this.audioMonitoringInterval) {
      console.log('🔄 Clearing existing audio monitoring interval')
      clearInterval(this.audioMonitoringInterval)
      this.audioMonitoringInterval = null
    }

    console.log('🎤 Starting audio level monitoring')
    console.log('🎤 Analyser frequency bin count:', this.analyser.frequencyBinCount)
    console.log('🎤 Audio context state:', this.audioContext?.state)

    let audioHistory: number[] = []
    const historySize = 10 // Track last 10 seconds
    let audioCheckCount = 0

    console.log('🎤 Creating audio monitoring interval...')
    this.audioMonitoringInterval = setInterval(() => {
      console.log(`🎤 Audio monitoring tick #${audioCheckCount + 1}`)
      audioCheckCount++
      
      // Check if audio context is suspended and resume it
      if (this.audioContext && this.audioContext.state === 'suspended') {
        console.warn('⚠️ Audio context suspended during monitoring, resuming...')
        this.audioContext.resume().catch(err => console.error('Failed to resume:', err))
      }
      
      if (audioCheckCount % 10 === 0) {
        console.log(`🎤 Audio monitoring running... (${audioCheckCount} cycles, context: ${this.audioContext?.state})`)
      }
      if (!this.analyser) {
        console.warn('⚠️ Analyser not available in audio monitoring interval - attempting to recreate...')
        // Try to recreate analyser if audio context and stream are still available
        if (this.audioContext && this.audioStream && this.audioContext.state !== 'closed') {
          try {
            const source = this.audioContext.createMediaStreamSource(this.audioStream)
            this.analyser = this.audioContext.createAnalyser()
            this.analyser.fftSize = 256
            this.audioDataArray = new Uint8Array(this.analyser.frequencyBinCount)
            source.connect(this.analyser)
            console.log('✅ Analyser recreated successfully')
          } catch (error) {
            console.error('❌ Failed to recreate analyser:', error)
            return
          }
        } else {
          console.warn('⚠️ Cannot recreate analyser - audio context or stream unavailable')
          return
        }
      }
      
      // Check if stream is still active - if not, try to restart
      if (!this.audioStream || !this.audioStream.active) {
        console.warn('⚠️ Audio stream not active during monitoring - attempting to restart...')
        // Don't return - let the watchdog handle it, but continue monitoring
        // The watchdog will restart the stream
        if (!this.audioStream) {
          return // Only return if stream doesn't exist at all
        }
      }

      // Create a new typed array to avoid type issues
      const tempArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.analyser.getByteFrequencyData(tempArray)

      // Calculate average audio level (convert to regular array to avoid type issues)
      const audioArray = Array.from(tempArray)
      const average = audioArray.reduce((a, b) => a + b, 0) / audioArray.length
      
      // Calculate standard deviation for better detection
      const arrayCopy = Array.from(tempArray)
      const variance = arrayCopy.reduce((sum, val) => {
        const diff = val - average
        return sum + (diff * diff)
      }, 0) / arrayCopy.length
      const stdDev = Math.sqrt(variance)
      
      // Find dominant frequency (peak in frequency spectrum)
      let maxFreq = 0
      let dominantFreqIndex = 0
      for (let i = 0; i < audioArray.length; i++) {
        if (audioArray[i] > maxFreq) {
          maxFreq = audioArray[i]
          dominantFreqIndex = i
        }
      }
      
      // Calculate frequency centroid (weighted average of frequencies)
      let weightedSum = 0
      let totalWeight = 0
      for (let i = 0; i < audioArray.length; i++) {
        weightedSum += i * audioArray[i]
        totalWeight += audioArray[i]
      }
      const freqCentroid = totalWeight > 0 ? weightedSum / totalWeight : 0
      
      // Establish baseline for first 5 seconds (assuming student is quiet/typing)
      if (this.audioSampleCount < 5) {
        // Only add to baseline if audio is relatively quiet (background noise)
        if (average < 30) {
          const count = this.baselineAudioFreq.length
          this.baselineAudioLevel = count === 0 ? average : (this.baselineAudioLevel * count + average) / (count + 1)
          this.baselineAudioFreq.push(freqCentroid)
        }
        this.audioSampleCount++
        
        if (this.audioSampleCount === 5) {
          // Calculate baseline frequency profile
          const baselineFreqAvg = this.baselineAudioFreq.length > 0 
            ? this.baselineAudioFreq.reduce((a, b) => a + b, 0) / this.baselineAudioFreq.length
            : freqCentroid
          const baselineFreqMin = Math.min(...this.baselineAudioFreq)
          const baselineFreqMax = Math.max(...this.baselineAudioFreq)
          
          this.studentVoiceProfile = {
            avgFreq: baselineFreqAvg,
            dominantFreq: dominantFreqIndex,
            freqRange: {
              min: baselineFreqMin * 0.9, // 10% margin below
              max: baselineFreqMax * 1.1   // 10% margin above
            }
          }
          console.log('🎤 Baseline audio profile established:', {
            level: this.baselineAudioLevel.toFixed(2),
            freqCentroid: baselineFreqAvg.toFixed(2),
            dominantFreq: dominantFreqIndex,
            freqRange: `${this.studentVoiceProfile.freqRange.min.toFixed(2)}-${this.studentVoiceProfile.freqRange.max.toFixed(2)}`,
            samples: this.baselineAudioFreq.length
          })
        }
        // Continue monitoring even during baseline - just don't use strict detection yet
      }
      
      // Learn student's voice frequency profile
      // When speech recognition is active, learn more aggressively
      // When speech recognition is inactive, learn more conservatively
      if (this.studentVoiceProfile) {
        const learningRate = this.speechRecognitionActive ? 0.15 : 0.08 // Learn faster when speaking
        const minLevel = this.speechRecognitionActive ? 20 : 15 // Lower threshold when speaking
        const maxLevel = this.speechRecognitionActive ? 80 : 70 // Higher threshold when speaking
        
        if (average > minLevel && average < maxLevel) {
          // Update baseline and frequency profile to learn student's voice
          this.baselineAudioLevel = this.baselineAudioLevel * (1 - learningRate) + average * learningRate
          this.studentVoiceProfile.avgFreq = this.studentVoiceProfile.avgFreq * (1 - learningRate) + freqCentroid * learningRate
          this.studentVoiceProfile.dominantFreq = this.studentVoiceProfile.dominantFreq * (1 - learningRate) + dominantFreqIndex * learningRate
          
          // Also track frequency range (min/max) for better filtering
          if (!this.studentVoiceProfile.freqRange) {
            this.studentVoiceProfile.freqRange = { min: freqCentroid, max: freqCentroid }
          } else {
            // Expand range to include current frequency (with some margin)
            if (freqCentroid < this.studentVoiceProfile.freqRange.min) {
              this.studentVoiceProfile.freqRange.min = freqCentroid * 0.9 // 10% margin
            }
            if (freqCentroid > this.studentVoiceProfile.freqRange.max) {
              this.studentVoiceProfile.freqRange.max = freqCentroid * 1.1 // 10% margin
            }
          }
        }
      }
      
      // Calculate frequency deviation from student's voice profile
      let freqDeviation = 0
      let dominantFreqDeviation = 0
      let isInStudentFreqRange = false
      
      if (this.studentVoiceProfile) {
        freqDeviation = Math.abs(freqCentroid - this.studentVoiceProfile.avgFreq)
        dominantFreqDeviation = Math.abs(dominantFreqIndex - this.studentVoiceProfile.dominantFreq)
        
        // Check if frequency is within student's learned range
        if (this.studentVoiceProfile.freqRange) {
          isInStudentFreqRange = freqCentroid >= this.studentVoiceProfile.freqRange.min && 
                                 freqCentroid <= this.studentVoiceProfile.freqRange.max
        } else {
          // Fallback: use average frequency with ±20% tolerance
          const tolerance = this.studentVoiceProfile.avgFreq * 0.2
          isInStudentFreqRange = freqDeviation <= tolerance
        }
      }
      
      // Detect external voice (different frequency from student's voice profile)
      // Only trigger if audio is significantly higher than baseline AND frequency is OUTSIDE student's range
      if (this.studentVoiceProfile && average > this.baselineAudioLevel + 20) {
        const levelIncrease = average - this.baselineAudioLevel
        
        // Alert if:
        // 1. Audio level is significantly higher than baseline (20+)
        // 2. AND frequency is OUTSIDE student's learned range (different voice)
        // 3. AND it's a sudden spike (not gradual increase from student speaking)
        const isSuddenSpike = audioHistory.length >= 2 && 
          average > (audioHistory[audioHistory.length - 2] || 0) + 15
        
        // Check if frequency is significantly different (outside student's range)
        const isDifferentFrequency = !isInStudentFreqRange && (freqDeviation > 15 || dominantFreqDeviation > 8)
        
        if (levelIncrease > 20 && isDifferentFrequency && isSuddenSpike && (Date.now() - this.lastAudioAlertTime > 5000)) {
          console.warn('⚠️ External voice detected (frequency outside your range)!', {
            currentFreq: freqCentroid.toFixed(2),
            yourFreqRange: this.studentVoiceProfile.freqRange 
              ? `${this.studentVoiceProfile.freqRange.min.toFixed(2)}-${this.studentVoiceProfile.freqRange.max.toFixed(2)}`
              : `${this.studentVoiceProfile.avgFreq.toFixed(2)}±20%`,
            freqDeviation: freqDeviation.toFixed(2),
            inYourRange: isInStudentFreqRange,
            currentLevel: average.toFixed(2),
            baselineLevel: this.baselineAudioLevel.toFixed(2),
            levelIncrease: levelIncrease.toFixed(2)
          })
          this.lastAudioAlertTime = Date.now()
          this.recordSuspiciousActivity({
            type: 'audio_detected',
            timestamp: Date.now(),
            severity: 'high',
            description: `External voice detected - audio frequency (${freqCentroid.toFixed(1)}) is outside your voice range (${this.studentVoiceProfile.freqRange ? `${this.studentVoiceProfile.freqRange.min.toFixed(1)}-${this.studentVoiceProfile.freqRange.max.toFixed(1)}` : 'learning...'})`
          })
        }
      }

      // Add to history (always, even during baseline)
      audioHistory.push(average)
      if (audioHistory.length > historySize) {
        audioHistory.shift()
      }

      // Log audio level periodically to confirm monitoring
      if (audioCheckCount % 10 === 0) {
        console.log(`🎤 Audio level: ${average.toFixed(2)} (stdDev: ${stdDev.toFixed(2)}, baseline: ${this.baselineAudioLevel.toFixed(2)}, history: ${audioHistory.length}, interval: ${this.audioMonitoringInterval ? 'active' : 'MISSING!'})`)
      } else if (audioCheckCount <= 10) {
        // Log first 10 checks to confirm it's running
        console.log(`🎤 Audio check #${audioCheckCount}: level=${average.toFixed(2)}, baseline=${this.baselineAudioLevel.toFixed(2)}, history=${audioHistory.length}`)
      }

      // Only run detection after baseline is established (5 seconds)
      if (this.audioSampleCount < 5) {
        return // Skip detection during baseline establishment
      }

      // AI-enhanced audio detection
      // Detect sudden spikes (someone speaking)
      if (audioHistory.length >= 3) {
        const recentAvg = audioHistory.slice(-3).reduce((a, b) => a + b, 0) / 3
        const previousAvg = audioHistory.length > 3
          ? audioHistory.slice(0, -3).reduce((a, b) => a + b, 0) / (audioHistory.length - 3)
          : this.baselineAudioLevel
        
        // If recent audio is significantly higher than previous, someone might be speaking
        if (recentAvg > previousAvg * 2 && recentAvg > 40) {
          console.warn('⚠️ Audio spike detected!', { recentAvg, previousAvg, baseline: this.baselineAudioLevel })
          this.recordSuspiciousActivity({
            type: 'audio_detected',
            timestamp: Date.now(),
            severity: 'medium',
            description: `Sudden audio spike detected - possible conversation or assistance (level: ${recentAvg.toFixed(2)})`
          })
        }
      }

      // When speech recognition is active, we still monitor but only alert for frequencies outside student's range
      // The frequency-based detection above already handles this, so we don't need to skip entirely
      // But we can be more lenient with other detections when student is speaking

      // Cooldown check to prevent spam alerts
      const now = Date.now()
      const timeSinceLastAlert = now - this.lastAudioAlertTime
      
      // Detect sustained high audio (TV, background audio, continuous talking)
      // Only alert if frequency is OUTSIDE student's voice range
      if (audioHistory.length >= 5 && timeSinceLastAlert > this.audioAlertCooldown) {
        const recentHistory = audioHistory.slice(-5)
        const sustainedHigh = recentHistory.every(level => level > 25) // Moderate threshold
        const historyAvg = recentHistory.reduce((a, b) => a + b, 0) / recentHistory.length
        
        // Check if sustained audio is significantly above baseline (TV/background audio)
        const baselineDiff = historyAvg - this.baselineAudioLevel
        if (sustainedHigh && this.baselineAudioLevel > 0 && baselineDiff > 20) {
          // Only alert if frequency is OUTSIDE student's learned range (external audio)
          // If frequency is within student's range, it's likely their voice
          if (!isInStudentFreqRange || historyAvg > 60) {
            console.warn('⚠️ Sustained external audio detected!', { 
              historyAvg: historyAvg.toFixed(2), 
              baseline: this.baselineAudioLevel.toFixed(2),
              difference: baselineDiff.toFixed(2),
              currentFreq: freqCentroid.toFixed(2),
              inYourRange: isInStudentFreqRange,
              yourFreqRange: this.studentVoiceProfile?.freqRange 
                ? `${this.studentVoiceProfile.freqRange.min.toFixed(2)}-${this.studentVoiceProfile.freqRange.max.toFixed(2)}`
                : 'learning...'
            })
            this.lastAudioAlertTime = now
            this.recordSuspiciousActivity({
              type: 'audio_detected',
              timestamp: now,
              severity: 'high',
              description: `Sustained external audio detected - frequency (${freqCentroid.toFixed(1)}) is outside your voice range (avg: ${historyAvg.toFixed(2)})`
            })
          }
        }
      }

      // Detect unusual patterns (multiple people speaking or TV audio)
      // Balanced sensitivity - detect TV/background audio but avoid false positives
      if (audioHistory.length >= 5 && timeSinceLastAlert > this.audioAlertCooldown) {
        const recentStdDev = stdDev
        const recentAvg = average
        const historyAvg = audioHistory.slice(-5).reduce((a, b) => a + b, 0) / 5
        
        // Balanced detection thresholds:
        // 1. Moderate variance (stdDev > 25) - indicates complex audio
        // 2. Moderate average (average > 30) - TV/background audio level
        // 3. Sustained over last 5 seconds (all recent levels > 25)
        // 4. Significantly above baseline (20+ above baseline)
        const recentHistory = audioHistory.slice(-5)
        const isSustainedHigh = recentHistory.every(level => level > 25)
        const baselineDiff = historyAvg - this.baselineAudioLevel
        const isSignificantlyAboveBaseline = this.baselineAudioLevel > 0 && baselineDiff > 20
        
        // Check frequency deviation to distinguish from student's voice
        const freqDeviation = this.studentVoiceProfile 
          ? Math.abs(freqCentroid - this.studentVoiceProfile.avgFreq)
          : 100
        
        if (isSustainedHigh && isSignificantlyAboveBaseline) {
          // Only alert if frequency is OUTSIDE student's learned range
          // If frequency is within student's range, it's likely their voice (even if complex pattern)
          if (recentStdDev > 25 && recentAvg > 30 && !isInStudentFreqRange) {
            console.warn('⚠️ Complex external audio pattern detected!', {
              stdDev: recentStdDev.toFixed(2),
              avg: recentAvg.toFixed(2),
              historyAvg: historyAvg.toFixed(2),
              baseline: this.baselineAudioLevel.toFixed(2),
              currentFreq: freqCentroid.toFixed(2),
              inYourRange: isInStudentFreqRange,
              yourFreqRange: this.studentVoiceProfile?.freqRange 
                ? `${this.studentVoiceProfile.freqRange.min.toFixed(2)}-${this.studentVoiceProfile.freqRange.max.toFixed(2)}`
                : 'learning...'
            })
            this.lastAudioAlertTime = now
            this.recordSuspiciousActivity({
              type: 'audio_detected',
              timestamp: now,
              severity: 'medium',
              description: `Complex external audio pattern detected - frequency (${freqCentroid.toFixed(1)}) is outside your voice range (variance: ${recentStdDev.toFixed(2)}, avg: ${recentAvg.toFixed(2)})`
            })
          }
        }
      }
    }, 1000) // Check every second
  }

  // Record suspicious activity
  private recordSuspiciousActivity(activity: SuspiciousActivity): void {
    this.state.suspiciousActivities.push(activity)
    this.state.violations++

    // Ensure audio monitoring continues after alert
    // Check if monitoring interval is still running
    if (!this.audioMonitoringInterval && this.state.isMonitoring && this.config.enableAudioMonitoring) {
      console.warn('⚠️ Audio monitoring interval stopped after alert - restarting...')
      // Restart monitoring if it stopped
      if (this.analyser && this.audioStream && this.audioStream.active) {
        this.startAudioLevelMonitoring()
      } else {
        console.warn('⚠️ Cannot restart audio monitoring - analyser or stream unavailable')
      }
    }

    // Ensure audio context is resumed (browser might suspend it when showing alerts)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log('🔄 Resuming suspended audio context after alert...')
      this.audioContext.resume().catch(err => {
        console.error('Failed to resume audio context after alert:', err)
      })
    }

    // Call callback if provided
    if (this.callbacks.onSuspiciousActivity) {
      this.callbacks.onSuspiciousActivity(activity)
    }

    if (this.callbacks.onViolation) {
      this.callbacks.onViolation(this.state.violations)
    }

    console.warn('Suspicious activity detected:', activity)
    console.log('🎤 Audio monitoring status after alert:', {
      intervalActive: !!this.audioMonitoringInterval,
      streamActive: this.audioStream?.active,
      contextState: this.audioContext?.state,
      analyserExists: !!this.analyser
    })
  }

  // Stop monitoring
  stopMonitoring(): void {
    console.log('🛑 stopMonitoring() called - stopping all proctoring')
    this.state.isMonitoring = false

    // Stop all media streams
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop())
      this.webcamStream = null
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop())
      this.audioStream = null
    }

    // Stop recorders
    if (this.webcamRecorder && this.webcamRecorder.state !== 'inactive') {
      this.webcamRecorder.stop()
      this.webcamRecorder = null
    }

    if (this.audioRecorder && this.audioRecorder.state !== 'inactive') {
      this.audioRecorder.stop()
      this.audioRecorder = null
    }

    // Dispose AI models
    if (this.faceDetector) {
      this.faceDetector.dispose()
      this.faceDetector = null
    }
    this.isModelLoaded = false

    // Stop Python AI service
    if (this.pythonAI) {
      this.pythonAI.stop()
      this.pythonAI = null
    }

    // Stop intervals
    if (this.faceDetectionInterval) {
      clearInterval(this.faceDetectionInterval)
      this.faceDetectionInterval = null
    }

    if (this.audioMonitoringInterval) {
      clearInterval(this.audioMonitoringInterval)
      this.audioMonitoringInterval = null
    }
    
    // Stop watchdogs
    if ((this as any).stopWatchdog) {
      ;(this as any).stopWatchdog()
      ;(this as any).stopWatchdog = null
    }
    
    if ((this as any).stopAudioWatchdog) {
      ;(this as any).stopAudioWatchdog()
      ;(this as any).stopAudioWatchdog = null
    }
    
    // Clear video keep-alive interval
    if ((this as any).videoKeepAliveInterval) {
      clearInterval((this as any).videoKeepAliveInterval)
      ;(this as any).videoKeepAliveInterval = null
    }

    // Cleanup DOM elements - check if they exist and have parent before removing
    if (this.webcamVideo) {
      try {
        // Remove pause event listener before cleanup
        if ((this.webcamVideo as any)._pauseHandler) {
          this.webcamVideo.removeEventListener('pause', (this.webcamVideo as any)._pauseHandler)
          delete (this.webcamVideo as any)._pauseHandler
        }
        
        if (this.webcamVideo.parentNode) {
          this.webcamVideo.parentNode.removeChild(this.webcamVideo)
        }
      } catch (error) {
        console.warn('Error removing webcam video element:', error)
      }
      this.webcamVideo = null
    }

    // Remove webcam label
    try {
      const labelElement = document.getElementById('proctoring-webcam-label')
      if (labelElement && labelElement.parentNode) {
        labelElement.parentNode.removeChild(labelElement)
      }
    } catch (error) {
      console.warn('Error removing webcam label element:', error)
    }

    if (this.canvas) {
      try {
        if (this.canvas.parentNode) {
          this.canvas.parentNode.removeChild(this.canvas)
        }
      } catch (error) {
        console.warn('Error removing canvas element:', error)
      }
      this.canvas = null
    }

    // Remove event listeners
    document.removeEventListener('contextmenu', this.handleRightClick)
    document.removeEventListener('keydown', this.handleKeyboardShortcuts)
    document.removeEventListener('selectstart', this.handleTextSelection)
    document.removeEventListener('dragstart', this.handleDragStart)
    document.removeEventListener('drop', this.handleDrop)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('blur', this.handleWindowBlur)
    window.removeEventListener('focus', this.handleWindowFocus)

    // Cleanup audio context
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.state.webcamActive = false
    this.state.audioMonitoringActive = false

    console.log('Proctoring stopped')
  }

  // Get current state
  getState(): ProctoringState {
    return { ...this.state }
  }

  // Get suspicious activities
  getSuspiciousActivities(): SuspiciousActivity[] {
    return [...this.state.suspiciousActivities]
  }

  // Set speech recognition state (to disable audio alerts when student is using voice input)
  setSpeechRecognitionActive(isActive: boolean): void {
    this.speechRecognitionActive = isActive
    if (isActive) {
      console.log('🎤 Speech recognition active - audio alerts disabled')
    } else {
      console.log('🎤 Speech recognition inactive - audio alerts enabled')
    }
  }
}

export default ProctoringService

