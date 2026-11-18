import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderTree, Search, Upload } from 'lucide-react';
import { categoriesApi, extractErrorMessage } from '../lib/api';
import { Layout } from '../components/layout/Layout';
import { CategoryBox } from '../components/notes/CategoryBox';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

export const CategoriesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'hierarchy'>('hierarchy');

  const { data: categories = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['categories', 'explore'],
    queryFn: () => categoriesApi.list(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.parentName && c.parentName.toLowerCase().includes(q))
    );
  }, [categories, search]);

  const rootCategories = useMemo(
    () => filtered.filter((c) => !c.parentId),
    [filtered]
  );

  const byId = useMemo(() => {
    const map = new Map<string, (typeof categories)[number]>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-ni-surface border border-ni-border p-6 mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FolderTree className="w-5 h-5 text-white" />
              <h1 className="text-2xl font-bold text-white">Category Exploration</h1>
            </div>
            <p className="text-sm text-ni-muted max-w-2xl">
              Categories evolve dynamically as learners upload notes. Each category uses a unique
              colored accent line while keeping the interface strictly monochromatic.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-ni-subtle absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories..."
                className="ni-input pl-9"
              />
            </div>

            <div className="flex border border-ni-border bg-ni-black">
              <button
                type="button"
                onClick={() => setViewMode('hierarchy')}
                className={`px-3 py-2 text-xs font-medium ${
                  viewMode === 'hierarchy' ? 'bg-white text-black' : 'text-ni-muted hover:text-white'
                }`}
              >
                Hierarchy
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-3 py-2 text-xs font-medium ${
                  viewMode === 'all' ? 'bg-white text-black' : 'text-ni-muted hover:text-white'
                }`}
              >
                All ({categories.length})
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 bg-ni-black border border-ni-border animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matching categories"
            description="Can't find the subject or exam you're looking for? Create it automatically when you upload your notes."
            action={
              <Link to="/upload" className="ni-btn-primary">
                <Upload className="w-4 h-4" /> Upload &amp; Create Category
              </Link>
            }
          />
        ) : viewMode === 'all' || search.trim().length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((cat) => (
              <CategoryBox key={cat.id} category={cat} />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {rootCategories.map((root) => {
              const childObjects = root.children
                .map((ch) => byId.get(ch.id))
                .filter((x): x is NonNullable<typeof x> => Boolean(x));

              return (
                <div key={root.id} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-ni-border pb-2">
                    <Link
                      to={`/categories/${encodeURIComponent(root.slug)}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <span
                        className="w-3 h-3 inline-block shrink-0"
                        style={{ backgroundColor: root.accentColor }}
                      />
                      <h2 className="text-base font-medium text-white group-hover:underline">
                        {root.name}
                      </h2>
                      <span className="text-xs text-ni-subtle">({root.noteCount} direct notes)</span>
                    </Link>
                    <Link
                      to={`/categories/${encodeURIComponent(root.slug)}`}
                      className="text-xs text-ni-muted hover:text-white"
                    >
                      View all &rarr;
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <CategoryBox category={root} />
                    {childObjects.map((child) => (
                      <CategoryBox key={child.id} category={child} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};
