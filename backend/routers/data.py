from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
from typing import List

from database import get_db
from models import ImageRecord, Annotation
from config import UPLOAD_DIR
from schemas import ImageRecordDTO, Detection, AnnotationUpdate

router = APIRouter()

@router.get("/history", response_model=List[ImageRecordDTO])
def get_history(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """
    Returns list of processed images with their detection counts.
    Supports pagination via 'skip' and 'limit'.
    """
    images = db.query(ImageRecord).order_by(ImageRecord.timestamp.desc()).offset(skip).limit(limit).all()
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

@router.get("/export")
def export_all_data(db: Session = Depends(get_db)):
    """
    Export all data (Images + Annotations) as a single JSON structure.
    """
    images = db.query(ImageRecord).all()
    export_data = []
    
    for img in images:
        annotations = []
        for ann in img.annotations:
            annotations.append({
                "label": ann.label,
                "confidence": ann.confidence,
                "box": {"x1": ann.x1, "y1": ann.y1, "x2": ann.x2, "y2": ann.y2}
            })
            
        export_data.append({
            "image_id": img.id,
            "filename": img.filename,
            "timestamp": img.timestamp.isoformat(),
            "annotations": annotations
        })
        
    return {"export_date": os.getcwd(), "record_count": len(export_data), "data": export_data}

@router.get("/images/{image_id}")
def get_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(ImageRecord).filter(ImageRecord.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    if not os.path.exists(img.filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    return FileResponse(img.filepath)

@router.get("/annotations/{image_id}", response_model=List[Detection])
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

@router.put("/annotations/{image_id}")
def update_annotations(image_id: int, new_annotations: List[AnnotationUpdate], db: Session = Depends(get_db)):
    # 1. Clear existing annotations for this image
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()
    
    # 2. Add new ones
    count = 0
    for ann in new_annotations:
        db_ann = Annotation(
            image_id=image_id,
            label=ann.label,
            confidence=ann.confidence,
            x1=ann.box.x1,
            y1=ann.box.y1,
            x2=ann.box.x2,
            y2=ann.box.y2
        )
        db.add(db_ann)
        count += 1
    
    db.commit()
    return {"status": "success", "count": count}

@router.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(ImageRecord).filter(ImageRecord.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete file from disk
    if os.path.exists(img.filepath):
        try:
            os.remove(img.filepath)
        except Exception as e:
            print(f"Error deleting file: {e}")
        
    # Delete from DB
    db.delete(img)
    db.commit()
    return {"status": "deleted", "id": image_id}
