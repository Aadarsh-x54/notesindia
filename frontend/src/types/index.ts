export type Role = 'USER' | 'MODERATOR' | 'ADMIN';
export type NoteStatus = 'PUBLISHED' | 'FLAGGED' | 'REMOVED';
export type ReportStatus = 'PENDING' | 'REVIEWED_DISMISSED' | 'REVIEWED_REMOVED';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  errors?: Record<string, string>;
  timestamp?: string;
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  bio?: string | null;
  institution?: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  bio?: string | null;
  institution?: string | null;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresInMs: number;
  user: User;
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  accentColor: string;
  parentId?: string | null;
  parentName?: string | null;
}

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  accentColor: string;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  noteCount: number;
  recentlyAdded: boolean;
  createdAt: string;
  children: CategorySummary[];
}

export interface DuplicateCheckResponse {
  exactMatch: boolean;
  existingMatch?: CategorySummary | null;
  similarCategories: CategorySummary[];
}

export interface UploaderSummary {
  id: string;
  username: string;
  fullName: string;
}

export interface NoteItem {
  id: string;
  title: string;
  description: string;
  subject?: string | null;
  institution?: string | null;
  authorName?: string | null;
  originalFilename: string;
  fileFormat: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: UploaderSummary;
  categories: CategorySummary[];
  downloadCount: number;
  viewCount: number;
  status: NoteStatus;
  aiIndexed: boolean;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewCategoryInput {
  name: string;
  parentId?: string | null;
  accentColor?: string | null;
}

export interface ReferencedNote {
  noteId: string;
  title: string;
  score: number;
  snippet: string;
  categories: string[];
  pageNumbers?: number[];
}

export interface AiMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  referencedNotes: ReferencedNote[];
  modelUsed?: string | null;
  createdAt: string;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  focusedNoteId?: string | null;
  focusedNoteTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationDetail extends AiConversationSummary {
  messages: AiMessage[];
}

export interface AiStatus {
  available: boolean;
  provider: string;
  activeModel: string;
  vectorStore: string;
  indexedChunks: number;
  message: string;
}

export interface ExtractedDocument {
  filename: string;
  pageCount: number;
  charCount: number;
  extractedText: string;
}

export interface CategoryAnalyticsItem {
  categoryId: string;
  name: string;
  slug: string;
  accentColor: string;
  noteCount: number;
  totalDownloads: number;
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalPublishedNotes: number;
  totalFlaggedNotes: number;
  totalCategories: number;
  totalDownloads: number;
  totalStorageBytes: number;
  pendingReports: number;
  topCategories: CategoryAnalyticsItem[];
}

export interface AdminReport {
  id: string;
  noteId: string;
  noteTitle: string;
  noteStatus: NoteStatus;
  reporterUsername: string;
  reason: string;
  details?: string | null;
  status: ReportStatus;
  reviewerUsername?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AuditLogItem {
  id: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: string | null;
  createdAt: string;
}
