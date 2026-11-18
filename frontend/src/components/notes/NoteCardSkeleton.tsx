import React from 'react';

export const NoteCardSkeleton: React.FC = () => {
  return (
    <div className="bg-ni-black border border-ni-border p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-20 bg-ni-surface2" />
        <div className="h-4 w-28 bg-ni-surface2" />
      </div>
      <div className="h-5 w-3/4 bg-ni-surface2 mb-2.5" />
      <div className="space-y-2 mb-4">
        <div className="h-3.5 w-full bg-ni-surface" />
        <div className="h-3.5 w-5/6 bg-ni-surface" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-16 bg-ni-surface2" />
        <div className="h-6 w-20 bg-ni-surface2" />
      </div>
      <div className="pt-3.5 border-t border-ni-border flex items-center justify-between">
        <div className="h-4 w-28 bg-ni-surface" />
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-ni-surface2" />
          <div className="h-8 w-20 bg-ni-surface2" />
        </div>
      </div>
    </div>
  );
};
