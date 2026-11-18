import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  return (
    <div className="bg-ni-black border border-ni-border p-8 text-center flex flex-col items-center">
      <AlertTriangle className="w-8 h-8 text-ni-muted mb-3" />
      <p className="text-sm text-white font-medium mb-1">Could not load data</p>
      <p className="text-xs text-ni-muted mb-4 max-w-md">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="ni-btn-secondary py-2 px-3 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
};
