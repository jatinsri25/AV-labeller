from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class Detection(BaseModel):
    label: str
    confidence: float
    box: BoundingBox

class DetectionResponse(BaseModel):
    filename: str
    image_id: int
    detections: List[Detection]

class ImageRecordDTO(BaseModel):
    id: int
    filename: str
    timestamp: datetime
    detection_count: int

    class Config:
        from_attributes = True

class AnnotationUpdate(BaseModel):
    label: str
    confidence: float
    box: BoundingBox
