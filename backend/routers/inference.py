from fastapi import APIRouter, File, UploadFile, Depends, Form
from sqlalchemy.orm import Session
from ultralytics import YOLO
from PIL import Image
import shutil
import os

from database import get_db
from models import ImageRecord, Annotation
from config import UPLOAD_DIR, MODEL_PATH
from schemas import DetectionResponse

router = APIRouter()

# Load Model Once
print("Loading Object Detection Model...")
model = YOLO(MODEL_PATH)
print("Model loaded successfully!")

@router.post("/detect", response_model=DetectionResponse)
def detect_objects(
    file: UploadFile = File(...), 
    enhance: bool = Form(False),
    db: Session = Depends(get_db)
):
    """
    Core inference pipeline:
    1. Persist uploaded asset.
    2. Register asset in database.
    3. Execute YOLOv8 inference (support for TTA via 'enhance' flag).
    4. Store detection metadata and return structured JSON.
    """
    # Persist file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Create DB Record
    # Check if exists first? For now, we'll just create new one or maybe overwrite if filename same?
    # Simple logic: create new record always to allow duplicates logic if needed, or handle duplicate filenames.
    # But for a demo, let's just add it.
    
    db_image = ImageRecord(filename=file.filename, filepath=file_path)
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    # Inference
    image = Image.open(file_path)
    
    # Run YOLOv8 with optional Test-Time Augmentation (TTA)
    results = model(image, augment=enhance, conf=0.2, iou=0.5)

    # Parse Results
    detections = []
    for result in results:
        for box in result.boxes:
            cords = box.xyxy[0].tolist()
            class_id = int(box.cls[0])
            conf = float(box.conf[0])
            label = model.names[class_id]
            
            x1, y1, x2, y2 = round(cords[0]), round(cords[1]), round(cords[2]), round(cords[3])

            # Persist Annotation
            db_annotation = Annotation(
                image_id=db_image.id,
                label=label,
                confidence=conf,
                x1=x1, y1=y1, x2=x2, y2=y2
            )
            db.add(db_annotation)

            detections.append({
                "label": label,
                "confidence": round(conf, 2),
                "box": { "x1": x1, "y1": y1, "x2": x2, "y2": y2 }
            })
    
    db.commit()

    return {
        "filename": file.filename, 
        "image_id": db_image.id,
        "detections": detections
    }
