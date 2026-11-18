import React from 'react';
import { Link } from 'react-router-dom';
import type { CategorySummary } from '../../types';

interface CategoryBadgeProps {
  category: CategorySummary;
  clickable?: boolean;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category, clickable = true }) => {
  const content = (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium text-white bg-ni-surface border border-ni-border hover:border-ni-borderHover transition-colors"
      style={{ borderBottomWidth: '2px', borderBottomColor: category.accentColor }}
    >
      {category.name}
    </span>
  );

  if (!clickable) return content;

  return (
    <Link to={`/categories/${encodeURIComponent(category.slug)}`} className="inline-block">
      {content}
    </Link>
  );
};
