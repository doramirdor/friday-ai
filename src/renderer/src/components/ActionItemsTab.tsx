import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  assignee?: string;
  dueDate?: string;
}

export const ActionItemsTab = (): React.ReactElement => {
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [newItem, setNewItem] = useState("");

  const addActionItem = (): void => {
    if (newItem.trim()) {
      const newActionItem: ActionItem = {
        id: Date.now().toString(),
        text: newItem,
        completed: false
      };
      setActionItems([...actionItems, newActionItem]);
      setNewItem("");
    }
  };

  const toggleCompleted = (id: string): void => {
    setActionItems(actionItems.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const deleteItem = (id: string): void => {
    setActionItems(actionItems.filter(item => item.id !== id));
  };

  return (
    <div className="action-items-tab-content">
      <div>
        <h2>Action Items</h2>
        <p className="tab-description">Track tasks and follow-ups from your meeting</p>
      </div>

      <div className="add-item-section">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add new action item..."
          className="form-input"
          onKeyPress={(e) => e.key === 'Enter' && addActionItem()}
        />
        <button onClick={addActionItem} className="add-btn">
          <Plus size={16} />
        </button>
      </div>

      <div className="action-items-list">
        {actionItems.map((item) => (
          <div key={item.id} className="action-item">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => toggleCompleted(item.id)}
              className="action-checkbox"
            />
            <span className={`action-text ${item.completed ? 'completed' : ''}`}>
              {item.text}
            </span>
            {item.assignee && (
              <span className={`assignee-badge ${item.assignee.toLowerCase()}`}>
                {item.assignee}
              </span>
            )}
            <button
              onClick={() => deleteItem(item.id)}
              className="delete-btn"
              title="Delete item"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {actionItems.length === 0 && (
        <div className="empty-state">
          <p>No action items yet. Add one above to get started.</p>
        </div>
      )}
    </div>
  );
};
