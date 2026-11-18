import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { extractErrorMessage, notesApi } from '../lib/api';
import { Layout } from '../components/layout/Layout';
import { NoteCard } from '../components/notes/NoteCard';
import { NoteCardSkeleton } from '../components/notes/NoteCardSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Pagination } from '../components/common/Pagination';

export const BookmarksPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notes', 'bookmarks', page],
    queryFn: () => notesApi.getBookmarks(page, 12),
  });

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2.5 border-b border-ni-border pb-4 mb-6">
          <Bookmark className="w-5 h-5 text-white" />
          <div>
            <h1 className="text-2xl font-bold text-white">Saved Bookmarks</h1>
            <p className="text-xs text-ni-muted">Your personal library of bookmarked NotesIndia study materials.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <NoteCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="No bookmarked notes yet"
            description="Click the bookmark icon on any note card to save it for fast exam revision."
            action={
              <Link to="/" className="ni-btn-primary">
                Browse Recent Notes
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.items.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onBookmarkChanged={() => {
                    void queryClient.invalidateQueries({ queryKey: ['notes', 'bookmarks'] });
                  }}
                />
              ))}
            </div>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              hasPrevious={data.hasPrevious}
              hasNext={data.hasNext}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </Layout>
  );
};
