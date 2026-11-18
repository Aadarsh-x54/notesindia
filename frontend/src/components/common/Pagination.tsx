import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPageChange: (nextPage: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-ni-border pt-6 mt-8">
      <p className="text-xs text-ni-muted">
        Page <span className="text-white font-medium">{page + 1}</span> of{' '}
        <span className="text-white font-medium">{totalPages}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}
          className="ni-btn-secondary py-1.5 px-3 text-xs"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <button
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          className="ni-btn-secondary py-1.5 px-3 text-xs"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
