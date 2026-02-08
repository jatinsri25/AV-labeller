import os

UPLOAD_DIR = "uploaded_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MODEL_PATH = "yolov8n.pt"  # Nano model for speed
