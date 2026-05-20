import cv2
import mediapipe as mp
import numpy as np
from flask import Flask, jsonify
from flask_cors import CORS
import threading
import time

app = Flask(__name__)
CORS(app)

# Global state
current_gaze_state = {
    'looking_at_screen': True,
    'confidence': 0.0,
    'timestamp': time.time()
}

# MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def calculate_eye_aspect_ratio(landmarks, eye_indices):
    """Calculate Eye Aspect Ratio (EAR) to detect blinks and gaze"""
    points = np.array([[landmarks[i].x, landmarks[i].y] for i in eye_indices])
    
    # Vertical distances
    v1 = np.linalg.norm(points[1] - points[5])
    v2 = np.linalg.norm(points[2] - points[4])
    
    # Horizontal distance
    h = np.linalg.norm(points[0] - points[3])
    
    ear = (v1 + v2) / (2.0 * h)
    return ear

def calculate_head_pose(landmarks, frame_shape):
    """Calculate head pose to determine if user is looking at screen"""
    h, w = frame_shape[:2]
    
    # Key facial landmarks
    nose_tip = landmarks[1]
    chin = landmarks[152]
    left_eye = landmarks[33]
    right_eye = landmarks[263]
    left_mouth = landmarks[61]
    right_mouth = landmarks[291]
    
    # Convert to pixel coordinates
    nose_2d = np.array([nose_tip.x * w, nose_tip.y * h])
    chin_2d = np.array([chin.x * w, chin.y * h])
    left_eye_2d = np.array([left_eye.x * w, left_eye.y * h])
    right_eye_2d = np.array([right_eye.x * w, right_eye.y * h])
    
    # Calculate face center
    face_center_x = (left_eye_2d[0] + right_eye_2d[0]) / 2
    face_center_y = (left_eye_2d[1] + right_eye_2d[1]) / 2
    
    # Calculate horizontal deviation (left/right looking)
    horizontal_deviation = abs(face_center_x - w/2) / (w/2)
    
    # Calculate vertical deviation (up/down looking)
    vertical_deviation = abs(face_center_y - h/2) / (h/2)
    
    return horizontal_deviation, vertical_deviation

def eye_tracking_loop():
    """Main eye tracking loop"""
    global current_gaze_state
    
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Eye landmark indices for EAR calculation
    LEFT_EYE = [362, 385, 387, 263, 373, 380]
    RIGHT_EYE = [33, 160, 158, 133, 153, 144]
    
    EAR_THRESHOLD = 0.2  # Threshold for detecting closed eyes
    GAZE_THRESHOLD = 0.35  # Threshold for detecting looking away
    BLINK_DURATION_THRESHOLD = 0.4  # Time in seconds to distinguish blink from looking away
    
    # Blink tracking variables
    eyes_closed_start_time = None
    is_blinking = False
    
    print("Eye tracker started. Press 'q' to quit.")
    print(f"Blink threshold: {BLINK_DURATION_THRESHOLD}s - Eyes closed longer will trigger 'looking away'")
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Flip frame horizontally for mirror view
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        results = face_mesh.process(rgb_frame)
        
        if results.multi_face_landmarks:
            face_landmarks = results.multi_face_landmarks[0]
            landmarks = face_landmarks.landmark
            
            # Calculate Eye Aspect Ratio
            left_ear = calculate_eye_aspect_ratio(landmarks, LEFT_EYE)
            right_ear = calculate_eye_aspect_ratio(landmarks, RIGHT_EYE)
            avg_ear = (left_ear + right_ear) / 2.0
            
            # Calculate head pose
            h_dev, v_dev = calculate_head_pose(landmarks, frame.shape)
            
            # Check if eyes are open or closed
            eyes_open = avg_ear > EAR_THRESHOLD
            looking_straight = h_dev < GAZE_THRESHOLD and v_dev < GAZE_THRESHOLD
            
            # Blink detection logic
            current_time = time.time()
            
            if not eyes_open:
                # Eyes are closed
                if eyes_closed_start_time is None:
                    # Just closed eyes - start timer
                    eyes_closed_start_time = current_time
                    is_blinking = True
                else:
                    # Eyes have been closed - check duration
                    closed_duration = current_time - eyes_closed_start_time
                    
                    if closed_duration > BLINK_DURATION_THRESHOLD:
                        # Eyes closed too long - not a blink, user is looking away
                        is_blinking = False
            else:
                # Eyes are open - reset blink tracking
                eyes_closed_start_time = None
                is_blinking = False
            
            # Determine if looking at screen
            # User is looking if: eyes open OR (eyes closed but blinking) AND looking straight
            if is_blinking:
                # During a quick blink, maintain previous state
                is_looking = looking_straight
                status_suffix = " (BLINKING)"
            elif not eyes_open:
                # Eyes closed for too long
                is_looking = False
                closed_duration = current_time - eyes_closed_start_time if eyes_closed_start_time else 0
                status_suffix = f" (EYES CLOSED {closed_duration:.1f}s)"
            else:
                # Eyes open - check gaze direction
                is_looking = eyes_open and looking_straight
                status_suffix = ""
            
            confidence = 1.0 - max(h_dev, v_dev) if eyes_open else 0.0
            
            # Update global state
            current_gaze_state = {
                'looking_at_screen': is_looking,
                'confidence': float(confidence),
                'timestamp': time.time(),
                'eye_aspect_ratio': float(avg_ear),
                'horizontal_deviation': float(h_dev),
                'vertical_deviation': float(v_dev),
                'eyes_open': eyes_open,
                'is_blinking': is_blinking
            }
            
            # Draw landmarks
            mp_drawing.draw_landmarks(
                frame,
                face_landmarks,
                mp_face_mesh.FACEMESH_TESSELATION,
                landmark_drawing_spec=None,
                connection_drawing_spec=mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=1)
            )
            
            # Display status
            status = "LOOKING" if is_looking else "LOOKING AWAY"
            color = (0, 255, 0) if is_looking else (0, 0, 255)
            cv2.putText(frame, status + status_suffix, (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
            cv2.putText(frame, f"Confidence: {confidence:.2f}", (10, 60), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"EAR: {avg_ear:.2f}", (10, 90), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Show blink status
            if is_blinking:
                cv2.putText(frame, "BLINK DETECTED", (10, 120), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            elif eyes_closed_start_time and not eyes_open:
                closed_duration = current_time - eyes_closed_start_time
                cv2.putText(frame, f"Eyes Closed: {closed_duration:.1f}s", (10, 120), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)
        else:
            # No face detected
            current_gaze_state = {
                'looking_at_screen': False,
                'confidence': 0.0,
                'timestamp': time.time(),
                'error': 'No face detected'
            }
            eyes_closed_start_time = None
            is_blinking = False
            cv2.putText(frame, "NO FACE DETECTED", (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        cv2.imshow('Eye Tracker', frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()

@app.route('/gaze_status', methods=['GET'])
def get_gaze_status():
    """API endpoint for browser extension to check gaze status"""
    return jsonify(current_gaze_state)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'running', 'timestamp': time.time()})

if __name__ == '__main__':
    # Start eye tracking in separate thread
    tracking_thread = threading.Thread(target=eye_tracking_loop, daemon=True)
    tracking_thread.start()
    
    # Start Flask server
    print("Starting Flask server on http://localhost:5000")
    print("Eye tracking window will open shortly...")
    app.run(host='0.0.0.0', port=5000, debug=False)