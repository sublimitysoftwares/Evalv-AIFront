# Python AI Backend Setup Guide

This guide explains how to set up and use the optional Python AI backend for advanced proctoring analysis.

## Overview

The Python AI backend provides more sophisticated analysis capabilities compared to browser-based TensorFlow.js:
- More accurate face detection using MediaPipe
- Advanced gaze tracking
- Better audio analysis with librosa
- Support for custom ML models

## Setup

### 1. Install Python Dependencies

```bash
pip install fastapi uvicorn opencv-python mediapipe numpy scipy librosa python-multipart pillow
```

### 2. Start the Python Backend

```bash
# Option 1: Using uvicorn directly
uvicorn python_ai_backend_example:app --host 0.0.0.0 --port 8001

# Option 2: Run the Python file
python python_ai_backend_example.py
```

The backend will be available at `http://localhost:8001`

### 3. Enable Python AI in Frontend

Edit `src/pages/Test/Test.tsx` and uncomment the `pythonAI` configuration:

```typescript
const proctoringConfig = {
  enableBrowserLockdown: true,
  enableWebcam: true,
  enableAudioMonitoring: true,
  recordSessions: true,
  pythonAI: {
    enabled: true,
    apiUrl: 'http://localhost:8001', // Adjust if needed
    sendVideoFrames: true,
    sendAudioChunks: true,
    frameInterval: 1000, // Send frame every 1 second
    audioChunkInterval: 2000 // Send audio chunk every 2 seconds
  }
}
```

## API Endpoints

The Python backend provides the following endpoints:

- `GET /health` - Health check
- `POST /analyze-face` - Analyze a single video frame
- `POST /analyze-audio` - Analyze an audio chunk
- `POST /analyze-video` - Analyze a video blob
- `POST /analyze-audio-blob` - Analyze an audio blob

## How It Works

1. **Browser-based detection** runs continuously for real-time monitoring
2. **Python AI** is called periodically for more advanced analysis
3. If Python AI is unavailable, the system falls back to browser-based detection
4. Results from Python AI are used to enhance violation detection

## Customization

You can customize the Python backend to:
- Add custom ML models (e.g., emotion detection, object detection)
- Implement more sophisticated audio analysis
- Add database logging
- Integrate with external AI services

## Performance Considerations

- Python AI adds network latency (typically 100-500ms per request)
- Adjust `frameInterval` and `audioChunkInterval` based on your needs
- For production, consider using WebSockets for real-time streaming
- Use a production ASGI server like Gunicorn with Uvicorn workers

## Security

- In production, restrict CORS to your frontend domain
- Add authentication/authorization
- Use HTTPS
- Validate and sanitize all inputs
- Rate limit API endpoints

