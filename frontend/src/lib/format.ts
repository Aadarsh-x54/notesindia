export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDateTime(iso);
}

export const CATEGORY_ACCENT_PALETTE = [
  { label: 'Blue', hex: '#3B82F6' },
  { label: 'Green', hex: '#22C55E' },
  { label: 'Orange', hex: '#F97316' },
  { label: 'Purple', hex: '#A855F7' },
  { label: 'Yellow', hex: '#EAB308' },
  { label: 'Cyan', hex: '#06B6D4' },
  { label: 'Red', hex: '#EF4444' },
  { label: 'Pink', hex: '#EC4899' },
  { label: 'Teal', hex: '#14B8A6' },
  { label: 'Indigo', hex: '#6366F1' },
];
