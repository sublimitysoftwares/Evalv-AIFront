"""
Python AI Backend for Advanced Proctoring Analysis
This is an example FastAPI backend that can be used for advanced AI analysis

Install dependencies:
pip install fastapi uvicorn opencv-python mediapipe numpy scipy librosa python-multipart

Run with:
uvicorn python_ai_backend_example:app --host 0.0.0.0 --port 8001
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import base64
import cv2
import numpy as np
import mediapipe as mp
from typing import Optional
import io
from PIL import Image
import librosa
import soundfile as sf

app = FastAPI(title="Proctoring AI Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MediaPipe Face Detection
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

face_detection = mp_face_detection.FaceDetection(
    model_selection=1, min_detection_confidence=0.5
)
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=2,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Python AI Proctoring"}


@app.post("/analyze-face")
async def analyze_face(image: str = Form(...), timestamp: Optional[int] = Form(None)):
    """
    Analyze a single video frame for face detection and behavior analysis
    
    Args:
        image: Base64 encoded image (JPEG)
        timestamp: Optional timestamp
    
    Returns:
        Analysis results including face count, position, gaze direction, etc.
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(image.split(',')[1] if ',' in image else image)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "Invalid image data"}
            )
        
        # Convert BGR to RGB
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Face detection
        results_detection = face_detection.process(rgb_img)
        results_mesh = face_mesh.process(rgb_img)
        
        faces_detected = len(results_detection.detections) if results_detection.detections else 0
        multiple_faces = faces_detected > 1
        
        # Analyze face mesh for gaze and position
        face_position = None
        looking_away = False
        person_left_seat = False
        
        if results_mesh.multi_face_landmarks:
            # Get first face landmarks
            face_landmarks = results_mesh.multi_face_landmarks[0]
            
            # Get key points (nose tip, eyes)
            h, w, _ = img.shape
            nose_tip = face_landmarks.landmark[1]  # Nose tip
            left_eye = face_landmarks.landmark[33]  # Left eye center
            right_eye = face_landmarks.landmark[263]  # Right eye center
            
            face_position = {
                "x": int(nose_tip.x * w),
                "y": int(nose_tip.y * h)
            }
            
            # Calculate eye center
            eye_center_x = (left_eye.x + right_eye.x) / 2
            eye_center_y = (left_eye.y + right_eye.y) / 2
            
            # Calculate deviation from nose (gaze direction)
            deviation_x = abs(eye_center_x - nose_tip.x)
            deviation_y = abs(eye_center_y - nose_tip.y)
            
            # If eyes are significantly off-center, person might be looking away
            if deviation_x > 0.1 or deviation_y > 0.1:
                looking_away = True
        
        # Calculate confidence based on detection quality
        confidence = 0.8 if faces_detected > 0 else 0.0
        
        return {
            "success": True,
            "analysis": {
                "facesDetected": faces_detected,
                "multipleFaces": multiple_faces,
                "facePosition": face_position,
                "lookingAway": looking_away,
                "personLeftSeat": person_left_seat,
                "confidence": confidence
            }
        }
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@app.post("/analyze-audio")
async def analyze_audio(
    audio: str = Form(...),
    sampleRate: int = Form(44100),
    timestamp: Optional[int] = Form(None)
):
    """
    Analyze audio chunk for suspicious patterns
    
    Args:
        audio: Base64 encoded audio data
        sampleRate: Audio sample rate
        timestamp: Optional timestamp
    
    Returns:
        Analysis results including audio level, speaker count, suspicious patterns
    """
    try:
        # Decode base64 audio
        audio_data = base64.b64decode(audio)
        audio_array = np.frombuffer(audio_data, dtype=np.float32)
        
        if len(audio_array) == 0:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "Invalid audio data"}
            )
        
        # Calculate audio level
        audio_level = np.abs(audio_array).mean() * 100
        
        # Detect if there's significant audio
        has_audio = audio_level > 10
        
        # Simple speaker count estimation (can be enhanced with ML models)
        # Using spectral analysis to detect multiple frequency patterns
        fft = np.fft.fft(audio_array)
        magnitude = np.abs(fft)
        
        # Count distinct frequency peaks (simplified approach)
        peaks = np.where(magnitude > np.mean(magnitude) * 2)[0]
        multiple_speakers = len(peaks) > 5 and has_audio
        
        # Detect suspicious patterns (sudden spikes, sustained high levels)
        suspicious_pattern = False
        if has_audio:
            # Check for sudden spikes
            if len(audio_array) > 100:
                recent_avg = np.abs(audio_array[-100:]).mean()
                previous_avg = np.abs(audio_array[:-100]).mean() if len(audio_array) > 100 else 0
                if recent_avg > previous_avg * 2:
                    suspicious_pattern = True
        
        confidence = 0.7 if has_audio else 0.0
        
        return {
            "success": True,
            "analysis": {
                "hasAudio": has_audio,
                "audioLevel": float(audio_level),
                "multipleSpeakers": multiple_speakers,
                "suspiciousPattern": suspicious_pattern,
                "confidence": confidence
            }
        }
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@app.post("/analyze-video")
async def analyze_video(
    video: UploadFile = File(...),
    timestamp: Optional[int] = Form(None)
):
    """
    Analyze video blob for advanced proctoring
    
    Args:
        video: Video file (webm format)
        timestamp: Optional timestamp
    
    Returns:
        Advanced analysis results
    """
    try:
        # Read video file
        video_bytes = await video.read()
        
        # Save to temporary file and process with OpenCV
        # (In production, use proper video processing)
        
        return {
            "success": True,
            "message": "Video analysis completed",
            "analysis": {
                "duration": 0,
                "framesAnalyzed": 0,
                "violations": []
            }
        }
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@app.post("/analyze-audio-blob")
async def analyze_audio_blob(
    audio: UploadFile = File(...),
    timestamp: Optional[int] = Form(None)
):
    """
    Analyze audio blob for advanced proctoring
    
    Args:
        audio: Audio file (webm format)
        timestamp: Optional timestamp
    
    Returns:
        Advanced audio analysis results
    """
    try:
        # Read audio file
        audio_bytes = await audio.read()
        
        # Process with librosa for advanced analysis
        # (In production, implement proper audio analysis)
        
        return {
            "success": True,
            "message": "Audio analysis completed",
            "analysis": {
                "duration": 0,
                "speakerCount": 0,
                "suspiciousPatterns": []
            }
        }
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

