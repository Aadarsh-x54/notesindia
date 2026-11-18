import React, { useState } from 'react';
import { X } from 'lucide-react';
import { extractErrorMessage, notesApi } from '../../lib/api';
import type { NewCategoryInput, NoteItem } from '../../types';
import { CategorySelector } from './CategorySelector';

interface EditNoteModalProps {
  note: NoteItem;
  onClose: () => void;
  onUpdated: (updated: NoteItem) => void;
}

export const EditNoteModal: React.FC<EditNoteModalProps> = ({ note, onClose, onUpdated }) => {
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState(note.description);
  const [subject, setSubject] = useState(note.subject || '');
  const [institution, setInstitution] = useState(note.institution || '');
  const [authorName, setAuthorName] = useState(note.authorName || '');
  const [categoryIds, setCategoryIds] = useState<string[]>(note.categories.map((c) => c.id));
  const [newCategories, setNewCategories] = useState<NewCategoryInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (categoryIds.length === 0 && newCategories.length === 0) {
      setError('Select or create at least one category.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await notesApi.update(note.id, {
        title: title.trim(),
        description: description.trim(),
        subject: subject.trim() || undefined,
        institution: institution.trim() || undefined,
        authorName: authorName.trim() || undefined,
        categoryIds,
        newCategories,
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-ni-surface border border-ni-border w-full max-w-2xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium text-white">Edit Note</h3>
          <button onClick={onClose} className="text-ni-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-ni-muted mb-1">Title *</label>
            <input
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="ni-input"
            />
          </div>

          <div>
            <label className="block text-xs text-ni-muted mb-1">Description *</label>
            <textarea
              required
              minLength={10}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="ni-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ni-muted mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="ni-input"
              />
            </div>
            <div>
              <label className="block text-xs text-ni-muted mb-1">Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="ni-input"
              />
            </div>
            <div>
              <label className="block text-xs text-ni-muted mb-1">Author</label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="ni-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-ni-muted mb-1.5">Categories *</label>
            <CategorySelector
              selectedIds={categoryIds}
              onSelectedIdsChange={setCategoryIds}
              newCategories={newCategories}
              onNewCategoriesChange={setNewCategories}
            />
          </div>

          {error && <p className="text-xs text-white bg-ni-black border border-ni-border p-3">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="ni-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="ni-btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
