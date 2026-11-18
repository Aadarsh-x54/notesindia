import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Upload } from 'lucide-react';
import { extractErrorMessage, notesApi } from '../lib/api';
import { Layout } from '../components/layout/Layout';
import { NoteCard } from '../components/notes/NoteCard';
import { NoteCardSkeleton } from '../components/notes/NoteCardSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Pagination } from '../components/common/Pagination';

const SUGGESTED_QUERIES = [
  'SSC CGL Mathematics',
  'Java OOP',
  'Python Machine Learning',
  'DBMS BTech',
  'Operating System',
  'Banking',
];

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [input, setInput] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const paramQ = searchParams.get('q') || '';
    setInput(paramQ);
    setDebouncedQuery(paramQ);
    setPage(0);
  }, [searchParams]);

  // 300ms debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim() !== debouncedQuery) {
        setDebouncedQuery(input.trim());
        setPage(0);
        if (input.trim()) {
          setSearchParams({ q: input.trim() }, { replace: true });
        } else {
          setSearchParams({}, { replace: true });
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, debouncedQuery, setSearchParams]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notes', 'search', debouncedQuery, page],
    queryFn: () => notesApi.search(debouncedQuery, page, 12),
  });

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-ni-surface border border-ni-border p-6 mb-8">
          <h1 className="text-xl font-bold text-white mb-1">Global Notes Search</h1>
          <p className="text-xs text-ni-muted mb-4">
            Search across titles, descriptions, subjects, exams, programming languages, institutions, and categories.
          </p>

          <div className="relative">
            <Search className="w-4 h-4 text-ni-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Try 'SSC CGL Mathematics', 'Java OOP', 'DBMS', 'Operating System'..."
              className="ni-input pl-10 py-3 text-base"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-ni-subtle">Popular queries:</span>
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setInput(q);
                  setDebouncedQuery(q);
                  setPage(0);
                  setSearchParams({ q });
                }}
                className="text-xs px-2.5 py-1 bg-ni-black border border-ni-border text-ni-muted hover:text-white hover:border-white transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 text-xs text-ni-muted">
          <span>
            {debouncedQuery ? (
              <>
                Showing results for <strong className="text-white">&ldquo;{debouncedQuery}&rdquo;</strong>
              </>
            ) : (
              'Showing all recent notes'
            )}
          </span>
          {data && <span>{data.totalElements} matching notes</span>}
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
            title={`No notes found for "${debouncedQuery}"`}
            description="Try broader keywords, check spelling, browse categories, or upload notes on this topic for the community."
            action={
              <div className="flex gap-2">
                <Link to="/categories" className="ni-btn-secondary">
                  Browse Categories
                </Link>
                <Link to="/upload" className="ni-btn-primary">
                  <Upload className="w-4 h-4" /> Upload Notes
                </Link>
              </div>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.items.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              hasPrevious={data.hasPrevious}
              hasNext={data.hasNext}
              onPageChange={(next) => {
                setPage(next);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>
    </Layout>
  );
};
