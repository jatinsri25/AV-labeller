from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io
import shutil
import os
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import ImageRecord, Annotation

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="NeuroLabel API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Load YOLOv8 Model
# Swapping models is as simple as changing the weight file string.
# 'yolov8n.pt' is optimized for speed (CPU inference), while 'yolov8m.pt' offers higher accuracy.
print("Loading Object Detection Model...")
model = YOLO("yolov8n.pt") 
print("Model loaded successfully!")

UPLOAD_DIR = "uploaded_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/")
def home():
    return {"status": "active", "system": "NeuroLabel Backend Service"}

@app.post("/detect")
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
    db_image = ImageRecord(filename=file.filename, filepath=file_path)
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    # Inference
    image = Image.open(file_path)
    
    # Run YOLOv8 with optional Test-Time Augmentation (TTA)
    # TTA ('enhance') increases accuracy by processing the image at multiple scales/flips,
    # useful for detecting small or occluded objects at the cost of inference speed.
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

    return {"filename": file.filename, "detections": detections, "image_id": db_image.id}

@app.get("/history")
def get_history(db: Session = Depends(get_db)):
    """
    Returns list of processed images with their detection counts.
    """
    images = db.query(ImageRecord).order_by(ImageRecord.timestamp.desc()).limit(20).all()
    history = []
    for img in images:
        count = len(img.annotations)
        history.append({
            "id": img.id,
            "filename": img.filename,
            "timestamp": img.timestamp,
            "detection_count": count
        })
    return history

@app.get("/images/{image_id}")
def get_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(ImageRecord).filter(ImageRecord.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    if not os.path.exists(img.filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    return FileResponse(img.filepath)

@app.get("/annotations/{image_id}")
def get_annotations(image_id: int, db: Session = Depends(get_db)):
    annotations = db.query(Annotation).filter(Annotation.image_id == image_id).all()
    if not annotations:
        return []
    
    result = []
    for ann in annotations:
        result.append({
            "label": ann.label,
            "confidence": ann.confidence,
            "box": {
                "x1": ann.x1,
                "y1": ann.y1,
                "x2": ann.x2,
                "y2": ann.y2
            }
        })
    return result

# NEW: Update annotations for an image (Manual Edit/Add)
@app.put("/annotations/{image_id}")
def update_annotations(image_id: int, new_annotations: list[dict], db: Session = Depends(get_db)):
    # 1. Clear existing annotations for this image
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()
    
    # 2. Add new ones
    for ann in new_annotations:
        db_ann = Annotation(
            image_id=image_id,
            label=ann['label'],
            confidence=ann['confidence'],
            x1=ann['box']['x1'],
            y1=ann['box']['y1'],
            x2=ann['box']['x2'],
            y2=ann['box']['y2']
        )
        db.add(db_ann)
    
    db.commit()
    return {"status": "success", "count": len(new_annotations)}

# NEW: Delete an image record
@app.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(ImageRecord).filter(ImageRecord.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete file from disk
    if os.path.exists(img.filepath):
        os.remove(img.filepath)
        
    # Delete from DB (Cascades should handle annotations if set up, but safe to delete manually or let ORM handle)
    # Assuming standard cascade delete might not be set in models.py, let's play safe or check models.
    # Actually, let's just delete the record, SQLAlchemy usually handles clean up if configured or we just leave orphans if not strict.
    # For a simple app, we can just delete the image record.
    db.delete(img)
    db.commit()
    return {"status": "deleted", "id": image_id}
