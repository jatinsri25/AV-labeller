import React from 'react';
import '../App.css';

interface HistoryItem {
    id: number;
    filename: string;
    timestamp: string;
    detection_count: number;
}

interface SidebarProps {
    history: HistoryItem[];
    onSelect: (id: number) => void;
    onDelete: (id: number) => void;
    selectedId: number | null; // Added to highlight active item
}

const Sidebar: React.FC<SidebarProps> = ({ history, onSelect, onDelete, selectedId }) => {
    return (
        <aside className="sidebar">
            <h3>Recent Scans</h3>
            <div className="history-list">
                {history.map(item => (
                    <div
                        key={item.id}
                        className={`history-item ${selectedId === item.id ? 'active' : ''}`}
                        onClick={() => onSelect(item.id)}
                    >
                        <span className="file-name" title={item.filename}>{item.filename}</span>
                        <div className="meta">
                            <span className="badge">{item.detection_count} objs</span>
                            <div className="actions">
                                <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                                <button
                                    className="delete-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Delete this scan?')) onDelete(item.id);
                                    }}
                                    title="Delete"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {history.length === 0 && (
                    <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        No recent history.
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;

