import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Calendar, Download, Eye, FileText, User as UserIcon } from 'lucide-react';
import type { NoteItem } from '../../types';
import { notesApi } from '../../lib/api';
import { formatDateTime, formatFileSize } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { CategoryBadge } from './CategoryBadge';

interface NoteCardProps {
  note: NoteItem;
  onBookmarkChanged?: (noteId: string, bookmarked: boolean) => void;
}

/**
 * Pure AMOLED black (#000000) Note Card with crisp white Roboto typography,
 * subtle grey borders, and color-accented category tags.
 */
export const NoteCard: React.FC<NoteCardProps> = ({ note, onBookmarkChanged }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [bookmarked, setBookmarked] = useState(note.bookmarked);
  const [toggling, setToggling] = useState(false);

  const handleBookmark = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (toggling) return;
    setToggling(true);
    try {
      const res = await notesApi.toggleBookmark(note.id);
      setBookmarked(res.bookmarked);
      onBookmarkChanged?.(note.id, res.bookmarked);
    } finally {
      setToggling(false);
    }
  };

  return (
    <article className="bg-ni-black border border-ni-border hover:border-ni-borderHover transition-colors p-5 flex flex-col justify-between">
      <div>
        {/* Top Metadata Row: Format, File Size, Upload Time */}
        <div className="flex items-center justify-between gap-2 text-xs text-ni-muted mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ni-surface border border-ni-border text-white font-medium uppercase tracking-wide text-[11px]">
              <FileText className="w-3 h-3" />
              {note.fileFormat}
            </span>
            <span>{formatFileSize(note.fileSizeBytes)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-ni-subtle">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <time dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time>
          </div>
        </div>

        {/* Title */}
        <Link to={`/notes/${note.id}`} className="block group">
          <h3 className="text-base font-medium text-white group-hover:underline leading-snug mb-2">
            {note.title}
          </h3>
        </Link>

        {/* Description */}
        <p className="text-sm text-ni-muted line-clamp-3 leading-relaxed mb-4">
          {note.description}
        </p>

        {/* Associated Categories (Multi-category without duplication) */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {note.categories.map((cat) => (
            <CategoryBadge key={cat.id} category={cat} />
          ))}
        </div>
      </div>

      {/* Footer: Uploader & Actions */}
      <div className="pt-3.5 border-t border-ni-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs text-ni-muted min-w-0">
          <UserIcon className="w-3.5 h-3.5 text-ni-subtle shrink-0" />
          <Link
            to={`/users/${encodeURIComponent(note.uploadedBy.username)}`}
            className="text-white hover:underline truncate"
          >
            {note.uploadedBy.fullName}
          </Link>
          <span className="text-ni-subtle">&bull;</span>
          <span className="text-ni-subtle shrink-0">{note.downloadCount} downloads</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBookmark}
            disabled={toggling}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark note'}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark note'}
            className={`p-2 border transition-colors ${
              bookmarked
                ? 'bg-white text-black border-white'
                : 'bg-ni-surface text-ni-muted border-ni-border hover:text-white hover:border-ni-borderHover'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>

          <Link
            to={`/notes/${note.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ni-surface text-white border border-ni-border hover:border-white transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </Link>

          <a
            href={notesApi.getDownloadUrl(note.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-black hover:bg-neutral-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>
      </div>
    </article>
  );
};
