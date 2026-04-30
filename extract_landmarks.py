import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import os
import json
import numpy as np
import urllib.request

def normalize_landmarks(landmarks):
    points = np.array([[lm.x, lm.y] for lm in landmarks])
    wrist = points[0]
    points = points - wrist
    max_dist = np.max(np.linalg.norm(points, axis=1))
    if max_dist > 0:
        points = points / max_dist
    return points.tolist()

def extract_dataset(data_dir, output_file, samples_per_class=50):
    model_path = 'hand_landmarker.task'
    if not os.path.exists(model_path):
        print("Downloading hand_landmarker.task...")
        url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
        urllib.request.urlretrieve(url, model_path)
        print("Downloaded.")

    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.HandLandmarkerOptions(base_options=base_options, num_hands=1)
    detector = vision.HandLandmarker.create_from_options(options)
    
    dataset = []
    if not os.path.exists(data_dir):
        print(f"Directory {data_dir} not found!")
        return
        
    classes = sorted(os.listdir(data_dir))
    
    for cls in classes:
        class_dir = os.path.join(data_dir, cls)
        if not os.path.isdir(class_dir):
            continue
            
        images = os.listdir(class_dir)
        print(f"Processing class: {cls}")
        
        count = 0
        for img_name in images:
            if count >= samples_per_class:
                break
                
            img_path = os.path.join(class_dir, img_name)
            
            # Use mediapipe Image object
            try:
                mp_image = mp.Image.create_from_file(img_path)
                detection_result = detector.detect(mp_image)
            except Exception as e:
                continue
            
            if detection_result.hand_landmarks:
                landmarks = detection_result.hand_landmarks[0]
                normalized = normalize_landmarks(landmarks)
                dataset.append({
                    "label": cls,
                    "landmarks": normalized
                })
                count += 1
                
        print(f"  Extracted {count} samples for {cls}")

    with open(output_file, 'w') as f:
        json.dump(dataset, f)
        
    print(f"Saved dataset to {output_file} with {len(dataset)} total samples.")

if __name__ == "__main__":
    base_dir = r"c:\Users\HP\OneDrive\Desktop\GestureTalk Application"
    static_data_dir = os.path.join(base_dir, "static_data")
    output_json = os.path.join(base_dir, "src", "gesture_model.json")
    
    extract_dataset(static_data_dir, output_json, samples_per_class=50)
