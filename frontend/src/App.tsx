import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';
import '../styles_overlay.css';
import Sidebar from './components/Sidebar';
import AnnotationCanvas from './components/AnnotationCanvas';

// Utility for generating unique session IDs for UI keys
const generateId = () => Math.random().toString(36).substr(2, 9);

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Detection {
  id: string;
  label: string;
  confidence: number;
  box: BoundingBox;
}

interface HistoryItem {
  id: number;
  filename: string;
  timestamp: string;
  detection_count: number;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);
  const [selectedId, selectShape] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.25);
  const [enhanceAccuracy, setEnhanceAccuracy] = useState<boolean>(false);

  // Global Keyboard Event Listener
  // Handles deletion of annotations via Del/Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setDetections(prev => prev.filter(d => d.id !== selectedId));
        selectShape(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/history');
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to fetch history");
    }
  };

  const loadHistoryItem = async (id: number) => {
    setIsLoading(true);
    setCurrentImageId(id);
    try {
      setImageSrc(`http://127.0.0.1:8000/images/${id}`);
      const res = await axios.get(`http://127.0.0.1:8000/annotations/${id}`);

      const mappedDetections = res.data.map((d: any) => ({
        ...d,
        id: generateId()
      }));

      setDetections(mappedDetections);
      setFile(null);
      setImageDimensions({ width: 0, height: 0 });
    } catch (err) {
      console.error("Failed to load item", err);
      alert("Could not load history item.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteHistoryItem = async (id: number) => {
    try {
      await axios.delete(`http://127.0.0.1:8000/images/${id}`);
      setHistory(history.filter(h => h.id !== id));
      if (currentImageId === id) {
        setImageSrc(null);
        setDetections([]);
        setCurrentImageId(null);
      }
    } catch (err) {
      console.error("Failed to delete item", err);
      alert("Failed to delete item.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setImageSrc(URL.createObjectURL(selectedFile));
      setDetections([]);
      setImageDimensions({ width: 0, height: 0 });
      setCurrentImageId(null);
    }
  };

  const handleDetect = async () => {
    if (!file) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('enhance', enhanceAccuracy.toString());

    try {
      const response = await axios.post('http://127.0.0.1:8000/detect', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const mappedDetections = response.data.detections.map((d: any) => ({
        ...d,
        id: generateId()
      }));

      setDetections(mappedDetections);
      setCurrentImageId(response.data.image_id);
      fetchHistory();
    } catch (error) {
      console.error('Error detecting objects:', error);
      alert('Failed to detect objects.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveAnnotations = async () => {
    if (!currentImageId) return;
    try {
      await axios.put(`http://127.0.0.1:8000/annotations/${currentImageId}`, detections);
      alert("Annotations saved!");
      fetchHistory();
    } catch (err) {
      console.error("Failed to save", err);
      alert("Failed to save annotations.");
    }
  };

  const exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(detections, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "annotations.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImageLoad = useCallback((width: number, height: number) => {
    setImageDimensions({ width, height });
  }, []);

  // Filter detections based on slider
  const visibleDetections = detections.filter(d => d.confidence >= confidenceThreshold);

  return (
    <div className="app-container">
      <header className="navbar">
        <h1>🧠 NeuroLabel</h1>
        <div className="navbar-actions">
          {currentImageId && (
            <>
              <button className="nav-btn" onClick={saveAnnotations}>💾 Save Changes</button>
              <button className="nav-btn secondary" onClick={exportData}>⬇ Export JSON</button>
            </>
          )}
        </div>
      </header>

      <div className="layout-row">
        <Sidebar
          history={history}
          onSelect={loadHistoryItem}
          onDelete={deleteHistoryItem}
        />

        <main className="main-content">
          <div className="controls-panel">
            <div className="card upload-card">
              <h2>1. Upload Image</h2>
              <input type="file" onChange={handleFileChange} accept="image/*" className="file-input" />

              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="enhance"
                  checked={enhanceAccuracy}
                  onChange={(e) => setEnhanceAccuracy(e.target.checked)}
                />
                <label htmlFor="enhance">Enhance Accuracy (Slower)</label>
              </div>

              <button
                onClick={handleDetect}
                disabled={!file || isLoading}
                className={`detect-btn ${isLoading ? 'loading' : ''}`}
              >
                {isLoading ? 'Processing...' : '⚡ Run YOLOv8 Nano'}
              </button>
            </div>

            <div className="card stats-card">
              <h2>Filters</h2>
              <div className="filter-group">
                <label>Confidence {'>'} {(confidenceThreshold * 100).toFixed(0)}%</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="slider"
                />
              </div>

              <h2>3. Detections ({visibleDetections.length})</h2>
              <p className="instruction-text">Click to edit. Del to remove. Wheel to zoom.</p>
              {visibleDetections.length === 0 ? (
                <p className="placeholder-text">No detections visible.</p>
              ) : (
                <ul className="detection-list">
                  {visibleDetections.map((d) => (
                    <li
                      key={d.id}
                      className={`detection-item ${selectedId === d.id ? 'selected' : ''}`}
                      onClick={() => selectShape(d.id)}
                    >
                      <span className="label">{d.label}</span>
                      <span className="conf">{(d.confidence * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="canvas-panel">
            <h2>2. Visualization & Editing</h2>
            {isLoading && (
              <div className="loading-overlay">
                <div className="spinner"></div>
                <p>Processing...</p>
              </div>
            )}
            <AnnotationCanvas
              imageSrc={imageSrc}
              detections={visibleDetections}
              setDetections={setDetections}
              onImageLoad={handleImageLoad}
              containerDimensions={imageDimensions}
              selectedId={selectedId}
              selectShape={selectShape}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
