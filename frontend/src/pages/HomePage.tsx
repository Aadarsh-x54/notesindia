import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, Clock, FolderTree, Search, Upload } from 'lucide-react';
import { categoriesApi, extractErrorMessage, notesApi } from '../lib/api';
import { Layout } from '../components/layout/Layout';
import { CategoryBox } from '../components/notes/CategoryBox';
import { NoteCard } from '../components/notes/NoteCard';
import { NoteCardSkeleton } from '../components/notes/NoteCardSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Pagination } from '../components/common/Pagination';

export const HomePage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [categoryFilterText, setCategoryFilterText] = useState('');

  const {
    data: categories = [],
    isLoading: catsLoading,
  } = useQuery({
    queryKey: ['categories', 'home'],
    queryFn: () => categoriesApi.list(),
  });

  // Main feed: strictly ALL recently uploaded notes in reverse chronological order.
  // No category filter, no subject filter, no popularity ranking, no personalization.
  const {
    data: feed,
    isLoading: feedLoading,
    isError: feedError,
    error: feedErrObj,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ['notes', 'recent-feed', page],
    queryFn: () => notesApi.getRecentFeed(page, 12),
  });

  const visibleCategories = useMemo(() => {
    const q = categoryFilterText.trim().toLowerCase();
    const list = q
      ? categories.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.parentName && c.parentName.toLowerCase().includes(q))
        )
      : categories;
    return list.slice(0, 12);
  }, [categories, categoryFilterText]);

  return (
    <Layout>
      {/* Compact Monochrome Header Banner */}
      <section className="bg-ni-surface border-b border-ni-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Educational Notes, Shared Openly.
            </h1>
            <p className="text-sm sm:text-base text-ni-muted mt-2 leading-relaxed">
              Discover, upload, and download community-contributed notes for competitive exams,
              engineering, programming, and independent study &mdash; powered by{' '}
              <span className="text-white font-medium">Padhaku AI</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link to="/upload" className="ni-btn-primary">
              <Upload className="w-4 h-4" />
              Upload Notes
            </Link>
            <Link to="/padhaku-ai" className="ni-btn-secondary">
              <Bot className="w-4 h-4" />
              Ask Padhaku AI
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Category Exploration Section */}
        <section aria-labelledby="categories-heading">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-ni-muted" />
              <h2 id="categories-heading" className="text-lg font-medium text-white">
                Explore Categories
              </h2>
              <span className="text-xs text-ni-subtle">({categories.length})</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-ni-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={categoryFilterText}
                  onChange={(e) => setCategoryFilterText(e.target.value)}
                  placeholder="Filter categories..."
                  className="w-full bg-ni-black border border-ni-border pl-8 pr-3 py-1.5 text-xs text-white placeholder-ni-subtle focus:outline-none focus:border-white"
                />
              </div>
              <Link
                to="/categories"
                className="text-xs font-medium text-white hover:underline inline-flex items-center gap-1 shrink-0"
              >
                All Categories <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {catsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 bg-ni-black border border-ni-border animate-pulse" />
              ))}
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="bg-ni-black border border-ni-border p-6 text-center text-xs text-ni-muted">
              No categories match &ldquo;{categoryFilterText}&rdquo;.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {visibleCategories.map((cat) => (
                <CategoryBox key={cat.id} category={cat} compact />
              ))}
            </div>
          )}
        </section>

        {/* Main Recently Uploaded Notes Feed — Strictly Reverse Chronological, Unfiltered */}
        <section aria-labelledby="recent-feed-heading">
          <div className="flex items-center justify-between gap-4 border-b border-ni-border pb-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-ni-muted" />
                <h2 id="recent-feed-heading" className="text-lg font-medium text-white">
                  Recently Uploaded Notes
                </h2>
              </div>
              <p className="text-xs text-ni-subtle mt-0.5">
                All community uploads in chronological order &mdash; newest first, unfiltered.
              </p>
            </div>
            {feed && (
              <span className="text-xs text-ni-muted shrink-0">
                {feed.totalElements} {feed.totalElements === 1 ? 'note' : 'notes'} total
              </span>
            )}
          </div>

          {feedLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <NoteCardSkeleton key={i} />
              ))}
            </div>
          ) : feedError ? (
            <ErrorState
              message={extractErrorMessage(feedErrObj, 'Failed to load recent notes feed')}
              onRetry={() => refetchFeed()}
            />
          ) : !feed || feed.items.length === 0 ? (
            <EmptyState
              title="No notes uploaded yet"
              description="Be the first to share educational notes with the NotesIndia community."
              action={
                <Link to="/upload" className="ni-btn-primary">
                  <Upload className="w-4 h-4" /> Upload First Note
                </Link>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {feed.items.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>

              <Pagination
                page={feed.page}
                totalPages={feed.totalPages}
                hasPrevious={feed.hasPrevious}
                hasNext={feed.hasNext}
                onPageChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </section>
      </div>
    </Layout>
  );
};
