import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Upload } from 'lucide-react';
import { categoriesApi, extractErrorMessage, notesApi } from '../lib/api';
import { Layout } from '../components/layout/Layout';
import { NoteCard } from '../components/notes/NoteCard';
import { NoteCardSkeleton } from '../components/notes/NoteCardSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Pagination } from '../components/common/Pagination';

export const CategoryDetailPage: React.FC = () => {
  const { slug = '' } = useParams();
  const [page, setPage] = useState(0);
  const [includeChildren, setIncludeChildren] = useState(true);

  const {
    data: category,
    isLoading: catLoading,
    isError: catError,
    error: catErrObj,
  } = useQuery({
    queryKey: ['category', slug],
    queryFn: () => categoriesApi.getBySlug(slug),
    enabled: Boolean(slug),
  });

  const {
    data: notesPage,
    isLoading: notesLoading,
    isError: notesError,
    error: notesErrObj,
    refetch,
  } = useQuery({
    queryKey: ['notes', 'category', slug, includeChildren, page],
    queryFn: () => notesApi.getByCategory(slug, includeChildren, page, 12),
    enabled: Boolean(slug),
  });

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4 flex items-center gap-2 text-xs text-ni-muted">
          <Link to="/categories" className="inline-flex items-center gap-1 hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" /> Categories
          </Link>
          {category?.parentName && category.parentSlug && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link
                to={`/categories/${encodeURIComponent(category.parentSlug)}`}
                className="hover:text-white"
              >
                {category.parentName}
              </Link>
            </>
          )}
          {category && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white">{category.name}</span>
            </>
          )}
        </div>

        {catLoading ? (
          <div className="h-32 bg-ni-black border border-ni-border animate-pulse mb-8" />
        ) : catError ? (
          <ErrorState message={extractErrorMessage(catErrObj, 'Category not found')} />
        ) : category ? (
          <>
            {/* Category Hero Box — AMOLED Black with Colored Top Accent Line */}
            <div
              className="bg-ni-black border border-ni-border p-6 mb-8"
              style={{ borderTopWidth: '4px', borderTopColor: category.accentColor }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-white">{category.name}</h1>
                    {category.recentlyAdded && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-ni-surface2 text-white border border-ni-border">
                        Recently Added
                      </span>
                    )}
                  </div>
                  {category.description && (
                    <p className="text-sm text-ni-muted mt-1.5 max-w-2xl">{category.description}</p>
                  )}
                </div>

                <Link to="/upload" className="ni-btn-primary shrink-0">
                  <Upload className="w-4 h-4" /> Upload to {category.name}
                </Link>
              </div>

              {/* Subcategories Navigation */}
              {category.children.length > 0 && (
                <div className="mt-5 pt-4 border-t border-ni-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <span className="text-xs uppercase tracking-wider text-ni-subtle font-medium">
                      Subcategories
                    </span>
                    <label className="inline-flex items-center gap-2 text-xs text-ni-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeChildren}
                        onChange={(e) => {
                          setIncludeChildren(e.target.checked);
                          setPage(0);
                        }}
                        className="accent-white"
                      />
                      Include notes from subcategories
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {category.children.map((child) => (
                      <Link
                        key={child.id}
                        to={`/categories/${encodeURIComponent(child.slug)}`}
                        className="px-3 py-1.5 bg-ni-surface border border-ni-border hover:border-white text-xs text-white transition-colors"
                        style={{ borderBottomWidth: '2px', borderBottomColor: child.accentColor }}
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Category Notes List */}
            {notesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <NoteCardSkeleton key={i} />
                ))}
              </div>
            ) : notesError ? (
              <ErrorState message={extractErrorMessage(notesErrObj)} onRetry={() => refetch()} />
            ) : !notesPage || notesPage.items.length === 0 ? (
              <EmptyState
                title={`No notes in ${category.name} yet`}
                description="Share the first study material for this category."
                action={
                  <Link to="/upload" className="ni-btn-primary">
                    <Upload className="w-4 h-4" /> Upload Notes
                  </Link>
                }
              />
            ) : (
              <>
                <div className="text-xs text-ni-muted mb-4">
                  Showing <strong className="text-white">{notesPage.totalElements}</strong>{' '}
                  {notesPage.totalElements === 1 ? 'note' : 'notes'} associated with {category.name}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {notesPage.items.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
                <Pagination
                  page={notesPage.page}
                  totalPages={notesPage.totalPages}
                  hasPrevious={notesPage.hasPrevious}
                  hasNext={notesPage.hasNext}
                  onPageChange={(next) => {
                    setPage(next);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </>
            )}
          </>
        ) : null}
      </div>
    </Layout>
  );
};
