import React, { useState } from 'react';
import { X } from 'lucide-react';
import { extractErrorMessage, notesApi } from '../../lib/api';

interface ReportNoteModalProps {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const REPORT_REASONS = [
  'Spam or irrelevant content',
  'Copyright / Plagiarism violation',
  'Inappropriate or offensive content',
  'Corrupted or unreadable file',
  'Misleading title or categories',
  'Other',
];

export const ReportNoteModal: React.FC<ReportNoteModalProps> = ({
  noteId,
  noteTitle,
  onClose,
  onSubmitted,
}) => {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await notesApi.report(noteId, reason, details.trim() || undefined);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-ni-surface border border-ni-border w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium text-white">Report Note</h3>
          <button onClick={onClose} className="text-ni-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-ni-muted mb-4">
          Reporting: <span className="text-white font-medium">{noteTitle}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-ni-muted mb-1.5">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="ni-input"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-ni-muted mb-1.5">Additional details</label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Explain why this note should be reviewed by moderators..."
              className="ni-input resize-none"
            />
          </div>

          {error && <p className="text-xs text-white bg-ni-black border border-ni-border p-2.5">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="ni-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="ni-btn-primary">
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
