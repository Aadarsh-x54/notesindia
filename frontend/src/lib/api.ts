import axios, { AxiosError } from 'axios';
import type {
  AdminDashboardStats,
  AdminReport,
  AiConversationDetail,
  AiConversationSummary,
  AiMessage,
  AiStatus,
  ApiResponse,
  AuditLogItem,
  AuthResponse,
  CategoryResponse,
  DuplicateCheckResponse,
  ExtractedDocument,
  NewCategoryInput,
  NoteItem,
  NoteStatus,
  PageResponse,
  PublicUser,
  ReferencedNote,
  ReportStatus,
  Role,
  User,
} from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const ACCESS_TOKEN_KEY = 'notesindia_access_token';
const REFRESH_TOKEN_KEY = 'notesindia_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshingPromise: Promise<string | null> | null = null;

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/refresh')) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        original._retry = true;
        try {
          if (!refreshingPromise) {
            refreshingPromise = axios
              .post<ApiResponse<AuthResponse>>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
              .then((r) => {
                const { accessToken, refreshToken: nextRefresh } = r.data.data;
                setAuthTokens(accessToken, nextRefresh);
                return accessToken;
              })
              .catch(() => {
                clearAuthTokens();
                return null;
              })
              .finally(() => {
                refreshingPromise = null;
              });
          }
          const nextAccess = await refreshingPromise;
          if (nextAccess) {
            original.headers.Authorization = `Bearer ${nextAccess}`;
            return http(original);
          }
        } catch {
          clearAuthTokens();
        }
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiResponse<unknown> | undefined;
    if (data?.errors && Object.keys(data.errors).length > 0) {
      return Object.entries(data.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(' | ');
    }
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

// ============================================================================
// Auth API
// ============================================================================
export const authApi = {
  async register(payload: {
    username: string;
    email: string;
    password: string;
    fullName: string;
    institution?: string;
  }): Promise<AuthResponse> {
    const { data } = await http.post<ApiResponse<AuthResponse>>('/auth/register', payload);
    return data.data;
  },

  async login(payload: { identifier: string; password: string }): Promise<AuthResponse> {
    const { data } = await http.post<ApiResponse<AuthResponse>>('/auth/login', payload);
    return data.data;
  },

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      await http.post('/auth/logout', { refreshToken });
    } finally {
      clearAuthTokens();
    }
  },

  async me(): Promise<User> {
    const { data } = await http.get<ApiResponse<User>>('/auth/me');
    return data.data;
  },

  async updateMe(payload: { fullName: string; bio?: string; institution?: string }): Promise<User> {
    const { data } = await http.put<ApiResponse<User>>('/auth/me', payload);
    return data.data;
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<void> {
    await http.put('/auth/me/password', payload);
  },

  async forgotPassword(email: string): Promise<{ message: string; resetTokenPreview?: string | null }> {
    const { data } = await http.post<ApiResponse<{ message: string; resetTokenPreview?: string | null }>>(
      '/auth/forgot-password',
      { email }
    );
    return data.data;
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await http.post('/auth/reset-password', { token, newPassword });
  },

  async getPublicProfile(username: string): Promise<PublicUser> {
    const { data } = await http.get<ApiResponse<PublicUser>>(`/auth/users/${encodeURIComponent(username)}`);
    return data.data;
  },
};

// ============================================================================
// Categories API
// ============================================================================
export const categoriesApi = {
  async list(params?: { q?: string; rootOnly?: boolean }): Promise<CategoryResponse[]> {
    const { data } = await http.get<ApiResponse<CategoryResponse[]>>('/categories', { params });
    return data.data;
  },

  async getBySlug(slug: string): Promise<CategoryResponse> {
    const { data } = await http.get<ApiResponse<CategoryResponse>>(`/categories/${encodeURIComponent(slug)}`);
    return data.data;
  },

  async checkDuplicate(name: string): Promise<DuplicateCheckResponse> {
    const { data } = await http.get<ApiResponse<DuplicateCheckResponse>>('/categories/check-duplicate', {
      params: { name },
    });
    return data.data;
  },

  async create(payload: {
    name: string;
    description?: string;
    accentColor?: string;
    parentId?: string | null;
  }): Promise<CategoryResponse> {
    const { data } = await http.post<ApiResponse<CategoryResponse>>('/categories', payload);
    return data.data;
  },
};

// ============================================================================
// Notes API
// ============================================================================
export const notesApi = {
  async getRecentFeed(page = 0, size = 12): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>('/notes', { params: { page, size } });
    return data.data;
  },

  async search(q: string, page = 0, size = 12): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>('/notes/search', {
      params: { q, page, size },
    });
    return data.data;
  },

  async getByCategory(slug: string, includeChildren = true, page = 0, size = 12): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>(
      `/notes/category/${encodeURIComponent(slug)}`,
      { params: { includeChildren, page, size } }
    );
    return data.data;
  },

  async getDetail(id: string, recordView = true): Promise<NoteItem> {
    const { data } = await http.get<ApiResponse<NoteItem>>(`/notes/${id}`, { params: { recordView } });
    return data.data;
  },

  async getRelated(id: string, limit = 4): Promise<NoteItem[]> {
    const { data } = await http.get<ApiResponse<NoteItem[]>>(`/notes/${id}/related`, { params: { limit } });
    return data.data;
  },

  async upload(
    payload: {
      file: File;
      title: string;
      description: string;
      subject?: string;
      institution?: string;
      authorName?: string;
      categoryIds: string[];
      newCategories: NewCategoryInput[];
    },
    onProgress?: (percent: number) => void
  ): Promise<NoteItem> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('title', payload.title);
    form.append('description', payload.description);
    if (payload.subject) form.append('subject', payload.subject);
    if (payload.institution) form.append('institution', payload.institution);
    if (payload.authorName) form.append('authorName', payload.authorName);
    for (const id of payload.categoryIds) {
      form.append('categoryIds', id);
    }
    if (payload.newCategories.length > 0) {
      form.append('newCategories', JSON.stringify(payload.newCategories));
    }

    const { data } = await http.post<ApiResponse<NoteItem>>('/notes', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (evt.total && onProgress) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    });
    return data.data;
  },

  async update(
    id: string,
    payload: {
      title: string;
      description: string;
      subject?: string;
      institution?: string;
      authorName?: string;
      categoryIds: string[];
      newCategories: NewCategoryInput[];
    }
  ): Promise<NoteItem> {
    const { data } = await http.put<ApiResponse<NoteItem>>(`/notes/${id}`, payload);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/notes/${id}`);
  },

  getDownloadUrl(id: string): string {
    return `${API_BASE_URL}/notes/${id}/download`;
  },

  getPreviewUrl(id: string): string {
    return `${API_BASE_URL}/notes/${id}/preview`;
  },

  async getTextPreview(id: string): Promise<string> {
    const { data } = await http.get<string>(`/notes/${id}/preview`, { responseType: 'text' });
    return data;
  },

  async toggleBookmark(id: string): Promise<{ noteId: string; bookmarked: boolean }> {
    const { data } = await http.post<ApiResponse<{ noteId: string; bookmarked: boolean }>>(`/notes/${id}/bookmark`);
    return data.data;
  },

  async getBookmarks(page = 0, size = 12): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>('/notes/bookmarks', {
      params: { page, size },
    });
    return data.data;
  },

  async getMyUploads(page = 0, size = 12): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>('/notes/my-uploads', {
      params: { page, size },
    });
    return data.data;
  },

  async getUserUploads(username: string, page = 0, size = 12): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>(
      `/notes/user/${encodeURIComponent(username)}`,
      { params: { page, size } }
    );
    return data.data;
  },

  async getRecentlyViewed(limit = 8): Promise<NoteItem[]> {
    const { data } = await http.get<ApiResponse<NoteItem[]>>('/notes/recently-viewed', { params: { limit } });
    return data.data;
  },

  async report(id: string, reason: string, details?: string): Promise<void> {
    await http.post(`/notes/${id}/report`, { reason, details });
  },
};

// ============================================================================
// Padhaku AI API
// ============================================================================
export const aiApi = {
  async getStatus(): Promise<AiStatus> {
    const { data } = await http.get<ApiResponse<AiStatus>>('/ai/status');
    return data.data;
  },

  async listConversations(): Promise<AiConversationSummary[]> {
    const { data } = await http.get<ApiResponse<AiConversationSummary[]>>('/ai/conversations');
    return data.data;
  },

  async createConversation(payload?: { title?: string; focusedNoteId?: string }): Promise<AiConversationDetail> {
    const { data } = await http.post<ApiResponse<AiConversationDetail>>('/ai/conversations', payload || {});
    return data.data;
  },

  async getConversation(id: string): Promise<AiConversationDetail> {
    const { data } = await http.get<ApiResponse<AiConversationDetail>>(`/ai/conversations/${id}`);
    return data.data;
  },

  async clearConversation(id: string): Promise<void> {
    await http.delete(`/ai/conversations/${id}/messages`);
  },

  async deleteConversation(id: string): Promise<void> {
    await http.delete(`/ai/conversations/${id}`);
  },

  async regenerate(id: string): Promise<AiMessage> {
    const { data } = await http.post<ApiResponse<AiMessage>>(`/ai/conversations/${id}/regenerate`);
    return data.data;
  },

  async extractDocument(file: File): Promise<ExtractedDocument> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await http.post<ApiResponse<ExtractedDocument>>('/ai/extract-document', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },

  async streamMessage(
    conversationId: string,
    payload: {
      message: string;
      focusedNoteId?: string | null;
      mode?: string;
      adHocDocumentText?: string | null;
      adHocDocumentName?: string | null;
    },
    callbacks: {
      onToken: (token: string) => void;
      onReferences: (refs: ReferencedNote[]) => void;
      onDone: (finalMessage: AiMessage) => void;
      onError: (errorMsg: string) => void;
    }
  ): Promise<void> {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/ai/conversations/${conversationId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => 'Failed to reach Padhaku AI');
      callbacks.onError(text || `Request failed with status ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';
    let receivedDone = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            currentEvent = 'message';
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (currentEvent === 'token' && typeof parsed.token === 'string') {
                callbacks.onToken(parsed.token);
              } else if (currentEvent === 'references' && Array.isArray(parsed)) {
                callbacks.onReferences(parsed as ReferencedNote[]);
              } else if (currentEvent === 'done') {
                receivedDone = true;
                callbacks.onDone(parsed as AiMessage);
              }
            } catch {
              // ignore non-json SSE heartbeat lines
            }
          }
        }
      }
      if (!receivedDone) {
        callbacks.onError('Stream ended unexpectedly before completion.');
      }
    } catch (streamErr) {
      callbacks.onError(extractErrorMessage(streamErr, 'Streaming interrupted.'));
    }
  },
};

// ============================================================================
// Admin API
// ============================================================================
export const adminApi = {
  async getStats(): Promise<AdminDashboardStats> {
    const { data } = await http.get<ApiResponse<AdminDashboardStats>>('/admin/stats');
    return data.data;
  },

  async listUsers(q?: string, page = 0, size = 20): Promise<PageResponse<User>> {
    const { data } = await http.get<ApiResponse<PageResponse<User>>>('/admin/users', {
      params: { q: q || undefined, page, size },
    });
    return data.data;
  },

  async updateUser(id: string, payload: { role?: Role; active?: boolean }): Promise<User> {
    const { data } = await http.patch<ApiResponse<User>>(`/admin/users/${id}`, payload);
    return data.data;
  },

  async listNotes(q?: string, page = 0, size = 20): Promise<PageResponse<NoteItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<NoteItem>>>('/admin/notes', {
      params: { q: q || undefined, page, size },
    });
    return data.data;
  },

  async updateNoteStatus(id: string, status: NoteStatus): Promise<NoteItem> {
    const { data } = await http.patch<ApiResponse<NoteItem>>(`/admin/notes/${id}/status`, { status });
    return data.data;
  },

  async reindexNote(id: string): Promise<{ indexed: boolean }> {
    const { data } = await http.post<ApiResponse<{ indexed: boolean }>>(`/admin/notes/${id}/reindex`);
    return data.data;
  },

  async listReports(status?: ReportStatus, page = 0, size = 20): Promise<PageResponse<AdminReport>> {
    const { data } = await http.get<ApiResponse<PageResponse<AdminReport>>>('/admin/reports', {
      params: { status: status || undefined, page, size },
    });
    return data.data;
  },

  async reviewReport(
    id: string,
    decision: ReportStatus,
    resolutionNote?: string
  ): Promise<AdminReport> {
    const { data } = await http.post<ApiResponse<AdminReport>>(`/admin/reports/${id}/review`, {
      decision,
      resolutionNote,
    });
    return data.data;
  },

  async updateCategory(
    id: string,
    payload: { name: string; description?: string; accentColor?: string; parentId?: string | null }
  ): Promise<CategoryResponse> {
    const { data } = await http.put<ApiResponse<CategoryResponse>>(`/admin/categories/${id}`, payload);
    return data.data;
  },

  async mergeCategories(sourceCategoryId: string, targetCategoryId: string): Promise<void> {
    await http.post('/admin/categories/merge', { sourceCategoryId, targetCategoryId });
  },

  async deleteCategory(id: string): Promise<void> {
    await http.delete(`/admin/categories/${id}`);
  },

  async listAuditLogs(page = 0, size = 25): Promise<PageResponse<AuditLogItem>> {
    const { data } = await http.get<ApiResponse<PageResponse<AuditLogItem>>>('/admin/audit-logs', {
      params: { page, size },
    });
    return data.data;
  },
};
