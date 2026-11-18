import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { CategoryResponse } from '../../types';

interface CategoryBoxProps {
  category: CategoryResponse;
  compact?: boolean;
}

/**
 * Category Identification Box:
 * Pure AMOLED black background (#000000), white text, thin colored accent line on top.
 */
export const CategoryBox: React.FC<CategoryBoxProps> = ({ category, compact = false }) => {
  return (
    <Link
      to={`/categories/${encodeURIComponent(category.slug)}`}
      className={`group block bg-ni-black border border-ni-border hover:border-ni-borderHover transition-colors ${
        compact ? 'p-3.5' : 'p-4'
      }`}
      style={{ borderTopWidth: '3px', borderTopColor: category.accentColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {category.parentName && (
            <p className="text-[11px] text-ni-subtle truncate mb-0.5">{category.parentName} /</p>
          )}
          <h3 className="text-sm font-medium text-white truncate group-hover:underline">
            {category.name}
          </h3>
        </div>
        {category.recentlyAdded && (
          <span className="shrink-0 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 bg-ni-surface2 text-white border border-ni-border">
            New
          </span>
        )}
      </div>

      {!compact && category.description && (
        <p className="text-xs text-ni-muted mt-1.5 line-clamp-2">{category.description}</p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-ni-muted">
        <span>
          <strong className="text-white font-medium">{category.noteCount}</strong>{' '}
          {category.noteCount === 1 ? 'note' : 'notes'}
        </span>
        <span className="inline-flex items-center gap-0.5 text-ni-subtle group-hover:text-white transition-colors">
          {category.children.length > 0 && (
            <span className="mr-1">{category.children.length} sub</span>
          )}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
};
