import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Transformer } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';

interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface Detection {
    id: string; // Add unique ID for React keys
    label: string;
    confidence: number;
    box: BoundingBox;
}

interface AnnotationCanvasProps {
    imageSrc: string | null;
    detections: Detection[];
    setDetections: (detections: Detection[]) => void;
    onImageLoad: (width: number, height: number) => void;
    containerDimensions: { width: number; height: number };
    selectedId: string | null;
    selectShape: (id: string | null) => void;
}

const URLImage = ({ src, onImageLoad }: { src: string; onImageLoad: (width: number, height: number) => void }) => {
    const [image] = useImage(src);
    useEffect(() => {
        if (image) {
            onImageLoad(image.width, image.height);
        }
    }, [image, onImageLoad]);
    return <KonvaImage image={image} />;
};

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
    imageSrc,
    detections,
    setDetections,
    onImageLoad,
    containerDimensions,
    selectedId,
    selectShape
}) => {
    const stageRef = useRef<Konva.Stage>(null);
    const trRef = useRef<Konva.Transformer>(null);

    useEffect(() => {
        if (selectedId && trRef.current && stageRef.current) {
            const node = stageRef.current.findOne('#' + selectedId);
            if (node) {
                trRef.current.nodes([node]);
                trRef.current.getLayer()?.batchDraw();
            }
        } else if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [selectedId, detections]);

    const checkDeselect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        // clicked on empty area - remove all selections
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
            selectShape(null);
        }
    };

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
        const node = e.target;
        const newBox = {
            x1: node.x(),
            y1: node.y(),
            x2: node.x() + node.width() * node.scaleX(),
            y2: node.y() + node.height() * node.scaleY()
        };
        node.scaleX(1);
        node.scaleY(1);

        // update state
        const newDetections = detections.map(d => {
            if (d.id === id) {
                return { ...d, box: newBox };
            }
            return d;
        });
        setDetections(newDetections);
    };

    const handleTransformEnd = (e: Konva.KonvaEventObject<Event>, id: string) => {
        const node = e.target;
        // transformer changes scale, so we have to calculate real width/height and reset scale
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        const newBox = {
            x1: node.x(),
            y1: node.y(),
            x2: node.x() + node.width() * scaleX,
            y2: node.y() + node.height() * scaleY
        };

        node.scaleX(1);
        node.scaleY(1);

        // update state
        const newDetections = detections.map(d => {
            if (d.id === id) {
                return { ...d, box: newBox };
            }
            return d;
        });
        setDetections(newDetections);
    };

    // Zoom Logic
    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const scaleBy = 1.1;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        let newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        // Limit zoom
        if (newScale < 0.1) newScale = 0.1;
        if (newScale > 5) newScale = 5;

        stage.scale({ x: newScale, y: newScale });

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        stage.position(newPos);
    };

    return (
        <div className="canvas-wrapper">
            {imageSrc ? (
                <Stage
                    width={containerDimensions.width}
                    height={containerDimensions.height}
                    className="konva-stage"
                    onMouseDown={checkDeselect}
                    onTouchStart={checkDeselect}
                    onWheel={handleWheel}
                    draggable
                    ref={stageRef}
                >
                    <Layer>
                        <URLImage src={imageSrc} onImageLoad={onImageLoad} />
                        {detections.map((d) => (
                            <React.Fragment key={d.id}>
                                <Rect
                                    id={d.id}
                                    x={d.box.x1}
                                    y={d.box.y1}
                                    width={d.box.x2 - d.box.x1}
                                    height={d.box.y2 - d.box.y1}
                                    stroke={selectedId === d.id ? "#00aaff" : "#00ff00"}
                                    strokeWidth={selectedId === d.id ? 4 : 3}
                                    draggable
                                    onDragStart={(e) => {
                                        e.cancelBubble = true; // prevent stage drag
                                    }}
                                    onDragEnd={(e) => handleDragEnd(e, d.id)}
                                    onTransformEnd={(e) => handleTransformEnd(e, d.id)}
                                    onClick={() => selectShape(d.id)}
                                    onTap={() => selectShape(d.id)}
                                />
                                <Text
                                    x={d.box.x1}
                                    y={d.box.y1 - 24} // Offset text to be above box
                                    text={`${d.label} ${(d.confidence * 100).toFixed(0)}%`}
                                    fontSize={18}
                                    fill={selectedId === d.id ? "#00aaff" : "#00ff00"}
                                    fontStyle="bold"
                                // Prevent scaling text weirdly? No, it should scale with zoom naturally
                                />
                            </React.Fragment>
                        ))}
                        <Transformer
                            ref={trRef}
                            boundBoxFunc={(oldBox, newBox) => {
                                // limit resize
                                if (newBox.width < 5 || newBox.height < 5) {
                                    return oldBox;
                                }
                                return newBox;
                            }}
                        />
                    </Layer>
                </Stage>
            ) : (
                <div className="empty-state">
                    <p>Image Preview will appear here</p>
                </div>
            )}
        </div>
    );
};

export default AnnotationCanvas;
