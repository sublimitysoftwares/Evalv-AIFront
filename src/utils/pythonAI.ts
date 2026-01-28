/* eslint-disable */

import axios from 'axios'

export interface PythonAIConfig {
  enabled: boolean
  apiUrl: string
  sendVideoFrames: boolean
  sendAudioChunks: boolean
  frameInterval: number // Send frame every N milliseconds
  audioChunkInterval: number // Send audio chunk every N milliseconds
}

export interface FaceAnalysisResult {
  facesDetected: number
  multipleFaces: boolean
  facePosition: { x: number; y: number } | null
  lookingAway: boolean
  personLeftSeat: boolean
  confidence: number
}

export interface AudioAnalysisResult {
  hasAudio: boolean
  audioLevel: number
  multipleSpeakers: boolean
  suspiciousPattern: boolean
  confidence: number
}

class PythonAIService {
  private config: PythonAIConfig
  private isActive: boolean = false

  constructor(config: PythonAIConfig) {
    this.config = config
  }

  // Send video frame to Python backend for analysis
  async analyzeVideoFrame(canvas: HTMLCanvasElement): Promise<FaceAnalysisResult | null> {
    if (!this.config.enabled || !this.isActive) {
      return null
    }

    try {
      // Convert canvas to base64 image
      const imageData = canvas.toDataURL('image/jpeg', 0.8)
      
      const response = await axios.post(
        `${this.config.apiUrl}/analyze-face`,
        {
          image: imageData,
          timestamp: Date.now()
        },
        {
          timeout: 5000, // 5 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.success) {
        return response.data.analysis as FaceAnalysisResult
      }
    } catch (error: any) {
      // Silently fail - don't break the exam if Python service is unavailable
      console.warn('Python AI analysis failed:', error.message)
    }

    return null
  }

  // Send audio chunk to Python backend for analysis
  async analyzeAudioChunk(audioData: Float32Array, sampleRate: number): Promise<AudioAnalysisResult | null> {
    if (!this.config.enabled || !this.isActive) {
      return null
    }

    try {
      // Convert Float32Array to base64
      const audioBuffer = audioData.buffer
      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(audioBuffer))
      )

      const response = await axios.post(
        `${this.config.apiUrl}/analyze-audio`,
        {
          audio: base64Audio,
          sampleRate: sampleRate,
          timestamp: Date.now()
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.success) {
        return response.data.analysis as AudioAnalysisResult
      }
    } catch (error: any) {
      console.warn('Python AI audio analysis failed:', error.message)
    }

    return null
  }

  // Send video blob for advanced analysis
  async analyzeVideoBlob(videoBlob: Blob): Promise<any> {
    if (!this.config.enabled || !this.isActive) {
      return null
    }

    try {
      const formData = new FormData()
      formData.append('video', videoBlob, 'video.webm')
      formData.append('timestamp', Date.now().toString())

      const response = await axios.post(
        `${this.config.apiUrl}/analyze-video`,
        formData,
        {
          timeout: 30000, // 30 seconds for video processing
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      )

      return response.data
    } catch (error: any) {
      console.warn('Python AI video blob analysis failed:', error.message)
      return null
    }
  }

  // Send audio blob for advanced analysis
  async analyzeAudioBlob(audioBlob: Blob): Promise<any> {
    if (!this.config.enabled || !this.isActive) {
      return null
    }

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('timestamp', Date.now().toString())

      const response = await axios.post(
        `${this.config.apiUrl}/analyze-audio-blob`,
        formData,
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      )

      return response.data
    } catch (error: any) {
      console.warn('Python AI audio blob analysis failed:', error.message)
      return null
    }
  }

  // Check if Python service is available
  async checkServiceHealth(): Promise<boolean> {
    if (!this.config.enabled) {
      return false
    }

    try {
      const response = await axios.get(`${this.config.apiUrl}/health`, {
        timeout: 3000
      })
      return response.status === 200
    } catch (error) {
      console.warn('Python AI service not available')
      return false
    }
  }

  // Start the service
  async start(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    const isHealthy = await this.checkServiceHealth()
    if (isHealthy) {
      this.isActive = true
      console.log('Python AI service started successfully')
    } else {
      console.warn('Python AI service not available, continuing without it')
      this.isActive = false
    }
  }

  // Stop the service
  stop(): void {
    this.isActive = false
    console.log('Python AI service stopped')
  }

  // Get service status
  getStatus(): { enabled: boolean; active: boolean } {
    return {
      enabled: this.config.enabled,
      active: this.isActive
    }
  }
}

export default PythonAIService

