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
}

const Sidebar: React.FC<SidebarProps> = ({ history, onSelect, onDelete }) => {
    return (
        <aside className="sidebar">
            <h3>Recent Scans</h3>
            <ul>
                {history.map(item => (
                    <li key={item.id} className="history-item">
                        <div className="history-info" onClick={() => onSelect(item.id)}>
                            <span className="file-name">{item.filename}</span>
                            <span className="badge">{item.detection_count} objs</span>
                        </div>
                        <button
                            className="delete-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this scan?')) onDelete(item.id);
                            }}
                        >
                            ×
                        </button>
                    </li>
                ))}
                {history.length === 0 && <p className="empty-history">No history yet.</p>}
            </ul>
        </aside>
    );
};

export default Sidebar;
