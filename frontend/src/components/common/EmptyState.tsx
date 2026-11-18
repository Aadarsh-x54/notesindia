import React from 'react';
import { FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div className="bg-ni-black border border-ni-border p-10 text-center flex flex-col items-center justify-center">
      <FileQuestion className="w-10 h-10 text-ni-subtle mb-3" />
      <h3 className="text-base font-medium text-white mb-1">{title}</h3>
      <p className="text-sm text-ni-muted max-w-md mb-5">{description}</p>
      {action}
    </div>
  );
};
