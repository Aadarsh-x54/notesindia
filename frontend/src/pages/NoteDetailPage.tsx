import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bookmark,
  Bot,
  Building2,
  Calendar,
  Download,
  Edit3,
  Eye,
  FileText,
  Flag,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { extractErrorMessage, notesApi } from '../lib/api';
import { formatDateTime, formatFileSize } from '../lib/format';
import { recordGuestView } from '../lib/recentlyViewed';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/layout/Layout';
import { CategoryBadge } from '../components/notes/CategoryBadge';
import { NoteCard } from '../components/notes/NoteCard';
import { ReportNoteModal } from '../components/notes/ReportNoteModal';
import { EditNoteModal } from '../components/notes/EditNoteModal';
import { ErrorState } from '../components/common/ErrorState';

export const NoteDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isStaff } = useAuth();

  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    data: note,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['note', id],
    queryFn: () => notesApi.getDetail(id, true),
    enabled: Boolean(id),
  });

  const { data: related = [] } = useQuery({
    queryKey: ['note', id, 'related'],
    queryFn: () => notesApi.getRelated(id, 4),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (note) {
      recordGuestView(note);
      if (note.fileFormat === 'TXT' || note.fileFormat === 'MD') {
        notesApi
          .getTextPreview(note.id)
          .then(setTextPreview)
          .catch(() => setTextPreview(null));
      } else {
        setTextPreview(null);
      }
    }
  }, [note]);

  const canModify = Boolean(note && user && (note.uploadedBy.id === user.id || isStaff));

  const handleBookmarkToggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!note || bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      await notesApi.toggleBookmark(note.id);
      await queryClient.invalidateQueries({ queryKey: ['note', id] });
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!note || deleting) return;
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    setDeleting(true);
    try {
      await notesApi.remove(note.id);
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      navigate('/');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-ni-muted hover:text-white mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        {isLoading ? (
          <div className="bg-ni-black border border-ni-border p-8 animate-pulse space-y-4">
            <div className="h-7 w-2/3 bg-ni-surface2" />
            <div className="h-4 w-full bg-ni-surface" />
            <div className="h-64 w-full bg-ni-surface" />
          </div>
        ) : isError ? (
          <ErrorState message={extractErrorMessage(error, 'Note not found')} onRetry={() => refetch()} />
        ) : note ? (
          <div className="space-y-8">
            {/* Main Note Card (Pure AMOLED Black) */}
            <div className="bg-ni-black border border-ni-border p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ni-muted">
                  <span className="px-2.5 py-1 bg-ni-surface border border-ni-border text-white font-medium uppercase">
                    {note.fileFormat}
                  </span>
                  <span>{formatFileSize(note.fileSizeBytes)}</span>
                  <span>&bull;</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> {note.viewCount} views
                  </span>
                  <span>&bull;</span>
                  <span className="inline-flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> {note.downloadCount} downloads
                  </span>
                  {note.aiIndexed && (
                    <>
                      <span>&bull;</span>
                      <span className="text-white border border-ni-border bg-ni-surface px-2 py-0.5 text-[11px]">
                        Padhaku AI Indexed
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-ni-subtle">
                  <Calendar className="w-3.5 h-3.5" />
                  <time dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-4">
                {note.title}
              </h1>

              <p className="text-sm sm:text-base text-ni-muted leading-relaxed whitespace-pre-line mb-6">
                {note.description}
              </p>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-ni-surface border border-ni-border p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ni-subtle mb-1">
                    Uploaded By
                  </div>
                  <Link
                    to={`/users/${encodeURIComponent(note.uploadedBy.username)}`}
                    className="text-sm text-white hover:underline inline-flex items-center gap-1.5"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-ni-muted" />
                    {note.uploadedBy.fullName}
                  </Link>
                </div>

                <div className="bg-ni-surface border border-ni-border p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ni-subtle mb-1">
                    Author
                  </div>
                  <div className="text-sm text-white truncate">
                    {note.authorName || note.uploadedBy.fullName}
                  </div>
                </div>

                <div className="bg-ni-surface border border-ni-border p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ni-subtle mb-1">
                    Subject
                  </div>
                  <div className="text-sm text-white truncate">{note.subject || 'General'}</div>
                </div>

                <div className="bg-ni-surface border border-ni-border p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ni-subtle mb-1">
                    Institution
                  </div>
                  <div className="text-sm text-white truncate inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-ni-muted shrink-0" />
                    {note.institution || 'Community Contributed'}
                  </div>
                </div>
              </div>

              {/* Categories */}
              <div className="mb-6">
                <div className="text-xs text-ni-subtle mb-2">Associated Categories</div>
                <div className="flex flex-wrap gap-2">
                  {note.categories.map((cat) => (
                    <CategoryBadge key={cat.id} category={cat} />
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-ni-border">
                <div className="flex flex-wrap items-center gap-2.5">
                  <a href={notesApi.getDownloadUrl(note.id)} className="ni-btn-primary">
                    <Download className="w-4 h-4" />
                    Download {note.fileFormat}
                  </a>

                  <Link
                    to={`/padhaku-ai?noteId=${encodeURIComponent(note.id)}`}
                    className="ni-btn-secondary border-white"
                  >
                    <Bot className="w-4 h-4" />
                    Ask Padhaku AI about this note
                  </Link>

                  <button
                    type="button"
                    onClick={handleBookmarkToggle}
                    disabled={bookmarkLoading}
                    className={`ni-btn-secondary ${
                      note.bookmarked ? 'bg-white text-black border-white hover:bg-neutral-200' : ''
                    }`}
                  >
                    <Bookmark
                      className="w-4 h-4"
                      fill={note.bookmarked ? 'currentColor' : 'none'}
                    />
                    {note.bookmarked ? 'Bookmarked' : 'Bookmark'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {canModify && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className="ni-btn-secondary py-2 px-3 text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="ni-btn-secondary py-2 px-3 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        navigate('/login');
                        return;
                      }
                      setReportOpen(true);
                    }}
                    className="ni-btn-ghost text-xs"
                  >
                    <Flag className="w-3.5 h-3.5" /> Report
                  </button>
                </div>
              </div>

              {reportSuccess && (
                <div className="mt-4 p-3 bg-ni-surface border border-ni-border text-xs text-white">
                  Thank you. Your report has been queued for moderator review.
                </div>
              )}
            </div>

            {/* Inline Note Preview Section */}
            <section className="bg-ni-black border border-ni-border">
              <div className="px-6 py-3.5 border-b border-ni-border flex items-center justify-between bg-ni-surface">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <FileText className="w-4 h-4 text-ni-muted" />
                  Document Preview &mdash; {note.originalFilename}
                </div>
                <a
                  href={notesApi.getPreviewUrl(note.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-ni-muted hover:text-white underline"
                >
                  Open in new tab
                </a>
              </div>

              <div className="p-4 sm:p-6">
                {note.fileFormat === 'PDF' ? (
                  <iframe
                    src={notesApi.getPreviewUrl(note.id)}
                    title={note.title}
                    className="w-full h-[680px] bg-ni-surface border border-ni-border"
                  />
                ) : textPreview !== null ? (
                  <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-sans leading-relaxed max-h-[620px] overflow-y-auto p-4 bg-ni-surface border border-ni-border">
                    {textPreview}
                  </pre>
                ) : (
                  <div className="py-12 text-center">
                    <FileText className="w-10 h-10 text-ni-subtle mx-auto mb-3" />
                    <p className="text-sm text-white mb-1">
                      Inline browser preview is available for PDF, TXT, and Markdown files.
                    </p>
                    <p className="text-xs text-ni-muted mb-4">
                      Download <strong className="text-white">{note.originalFilename}</strong> to
                      view it in full quality, or ask Padhaku AI to summarize its contents.
                    </p>
                    <a href={notesApi.getDownloadUrl(note.id)} className="ni-btn-primary">
                      <Download className="w-4 h-4" /> Download File
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Related Notes */}
            {related.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-white mb-4">Related Notes</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {related.map((rel) => (
                    <NoteCard key={rel.id} note={rel} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>

      {reportOpen && note && (
        <ReportNoteModal
          noteId={note.id}
          noteTitle={note.title}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => setReportSuccess(true)}
        />
      )}

      {editOpen && note && (
        <EditNoteModal
          note={note}
          onClose={() => setEditOpen(false)}
          onUpdated={() => {
            void queryClient.invalidateQueries({ queryKey: ['note', id] });
          }}
        />
      )}
    </Layout>
  );
};
