import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  FileText,
  Flag,
  FolderTree,
  GitMerge,
  HardDrive,
  RefreshCw,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { adminApi, categoriesApi, extractErrorMessage } from '../lib/api';
import { formatDateTime, formatFileSize } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { NoteStatus, ReportStatus, Role } from '../types';
import { Layout } from '../components/layout/Layout';

type AdminTab = 'overview' | 'reports' | 'notes' | 'categories' | 'users' | 'audit';

export const AdminDashboardPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [noteSearch, setNoteSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [reportFilter, setReportFilter] = useState<ReportStatus | ''>('PENDING');

  // Merge Categories state
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.getStats(),
  });

  const { data: reportsPage } = useQuery({
    queryKey: ['admin', 'reports', reportFilter],
    queryFn: () => adminApi.listReports(reportFilter || undefined, 0, 30),
    enabled: tab === 'reports',
  });

  const { data: notesPage } = useQuery({
    queryKey: ['admin', 'notes', noteSearch],
    queryFn: () => adminApi.listNotes(noteSearch, 0, 30),
    enabled: tab === 'notes',
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'admin'],
    queryFn: () => categoriesApi.list(),
    enabled: tab === 'categories' || tab === 'overview',
  });

  const { data: usersPage } = useQuery({
    queryKey: ['admin', 'users', userSearch],
    queryFn: () => adminApi.listUsers(userSearch, 0, 30),
    enabled: tab === 'users' && isAdmin,
  });

  const { data: auditPage } = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => adminApi.listAuditLogs(0, 30),
    enabled: tab === 'audit',
  });

  const showBanner = (msg: string) => {
    setActionBanner(msg);
    setTimeout(() => setActionBanner(null), 4000);
  };

  const handleReviewReport = async (reportId: string, decision: ReportStatus) => {
    try {
      await adminApi.reviewReport(reportId, decision, `Reviewed via Admin Dashboard (${decision})`);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      showBanner(`Report marked as ${decision}`);
    } catch (err) {
      showBanner(extractErrorMessage(err));
    }
  };

  const handleNoteStatus = async (noteId: string, status: NoteStatus) => {
    try {
      await adminApi.updateNoteStatus(noteId, status);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      showBanner(`Note status changed to ${status}`);
    } catch (err) {
      showBanner(extractErrorMessage(err));
    }
  };

  const handleReindexNote = async (noteId: string) => {
    try {
      const res = await adminApi.reindexNote(noteId);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'notes'] });
      showBanner(res.indexed ? 'Note indexed into Padhaku AI vector store' : 'AI service offline; indexing deferred');
    } catch (err) {
      showBanner(extractErrorMessage(err));
    }
  };

  const handleMergeCategories = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      showBanner('Select two different categories to merge.');
      return;
    }
    try {
      await adminApi.mergeCategories(mergeSourceId, mergeTargetId);
      setMergeSourceId('');
      setMergeTargetId('');
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      showBanner('Duplicate category merged cleanly without duplicating notes.');
    } catch (err) {
      showBanner(extractErrorMessage(err));
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm('Delete this empty category?')) return;
    try {
      await adminApi.deleteCategory(categoryId);
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      showBanner('Category deleted.');
    } catch (err) {
      showBanner(extractErrorMessage(err));
    }
  };

  const handleUserUpdate = async (userId: string, payload: { role?: Role; active?: boolean }) => {
    try {
      await adminApi.updateUser(userId, payload);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      showBanner('User permissions updated.');
    } catch (err) {
      showBanner(extractErrorMessage(err));
    }
  };

  const maxCatNotes = Math.max(1, ...(stats?.topCategories.map((c) => c.noteCount) || [1]));

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ni-border pb-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-white" />
            <div>
              <h1 className="text-2xl font-bold text-white">Admin &amp; Moderation Dashboard</h1>
              <p className="text-xs text-ni-muted">
                Monitor platform growth, storage, reports, dynamic categories, and users.
              </p>
            </div>
          </div>
          {actionBanner && (
            <div className="px-3.5 py-2 bg-ni-black border border-white text-xs text-white">
              {actionBanner}
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-ni-border">
          {(
            [
              { id: 'overview', label: 'Overview & Analytics', icon: BarChart3 },
              { id: 'reports', label: `Reports (${stats?.pendingReports ?? 0})`, icon: Flag },
              { id: 'notes', label: 'Manage Notes', icon: FileText },
              { id: 'categories', label: 'Categories & Merge', icon: FolderTree },
              ...(isAdmin ? [{ id: 'users', label: 'Users', icon: Users }] : []),
              { id: 'audit', label: 'Activity Log', icon: Activity },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as AdminTab)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === item.id
                    ? 'border-white text-white bg-ni-surface'
                    : 'border-transparent text-ni-muted hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* 1. Overview & Category Growth Analytics */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile label="Published Notes" value={stats.totalPublishedNotes.toString()} />
              <StatTile label="Registered Users" value={stats.totalUsers.toString()} />
              <StatTile label="Total Downloads" value={stats.totalDownloads.toString()} />
              <StatTile
                label="Storage Used"
                value={formatFileSize(stats.totalStorageBytes)}
                icon={<HardDrive className="w-4 h-4 text-ni-muted" />}
              />
              <StatTile label="Dynamic Categories" value={stats.totalCategories.toString()} />
              <StatTile label="Pending Reports" value={stats.pendingReports.toString()} />
              <StatTile label="Flagged Notes" value={stats.totalFlaggedNotes.toString()} />
            </div>

            <div className="bg-ni-black border border-ni-border p-6">
              <h2 className="text-base font-medium text-white mb-1">Category Growth Analytics</h2>
              <p className="text-xs text-ni-muted mb-5">
                Distribution of published notes and downloads across active categories.
              </p>

              <div className="space-y-3">
                {stats.topCategories.map((cat) => (
                  <div key={cat.categoryId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <Link
                        to={`/categories/${encodeURIComponent(cat.slug)}`}
                        className="text-white hover:underline font-medium flex items-center gap-2"
                      >
                        <span
                          className="w-2.5 h-2.5 inline-block"
                          style={{ backgroundColor: cat.accentColor }}
                        />
                        {cat.name}
                      </Link>
                      <span className="text-ni-muted">
                        <strong className="text-white">{cat.noteCount}</strong> notes &bull;{' '}
                        {cat.totalDownloads} downloads
                      </span>
                    </div>
                    <div className="w-full h-2 bg-ni-surface">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(4, Math.round((cat.noteCount / maxCatNotes) * 100))}%`,
                          backgroundColor: cat.accentColor,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Reported Content Queue */}
        {tab === 'reports' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(['PENDING', '', 'REVIEWED_REMOVED', 'REVIEWED_DISMISSED'] as const).map((st) => (
                <button
                  key={st || 'ALL'}
                  onClick={() => setReportFilter(st)}
                  className={`px-3 py-1.5 text-xs border ${
                    reportFilter === st
                      ? 'bg-white text-black border-white'
                      : 'bg-ni-black text-ni-muted border-ni-border hover:text-white'
                  }`}
                >
                  {st || 'All Reports'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {!reportsPage || reportsPage.items.length === 0 ? (
                <div className="bg-ni-black border border-ni-border p-8 text-center text-xs text-ni-muted">
                  No reports matching this filter.
                </div>
              ) : (
                reportsPage.items.map((rep) => (
                  <div
                    key={rep.id}
                    className="bg-ni-black border border-ni-border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 bg-ni-surface2 border border-ni-border text-white">
                          {rep.status}
                        </span>
                        <span className="text-ni-muted">Reason: {rep.reason}</span>
                      </div>
                      <Link
                        to={`/notes/${rep.noteId}`}
                        className="text-sm font-medium text-white hover:underline block"
                      >
                        {rep.noteTitle}
                      </Link>
                      {rep.details && <p className="text-xs text-ni-muted">{rep.details}</p>}
                      <p className="text-[11px] text-ni-subtle">
                        Reported by @{rep.reporterUsername} &bull; {formatDateTime(rep.createdAt)}
                      </p>
                    </div>

                    {rep.status === 'PENDING' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleReviewReport(rep.id, 'REVIEWED_DISMISSED')}
                          className="ni-btn-secondary py-1.5 px-3 text-xs"
                        >
                          Dismiss Report
                        </button>
                        <button
                          onClick={() => handleReviewReport(rep.id, 'REVIEWED_REMOVED')}
                          className="ni-btn-primary py-1.5 px-3 text-xs"
                        >
                          Remove Note
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. Manage Notes */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <input
              type="text"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              placeholder="Search notes by title, description, or uploader username..."
              className="ni-input max-w-md"
            />
            <div className="bg-ni-black border border-ni-border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-ni-surface border-b border-ni-border text-ni-muted uppercase">
                  <tr>
                    <th className="p-3">Title</th>
                    <th className="p-3">Uploader</th>
                    <th className="p-3">Format / Size</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">AI Index</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ni-border">
                  {(notesPage?.items || []).map((n) => (
                    <tr key={n.id} className="hover:bg-ni-surface">
                      <td className="p-3 font-medium text-white max-w-xs truncate">
                        <Link to={`/notes/${n.id}`} className="hover:underline">
                          {n.title}
                        </Link>
                      </td>
                      <td className="p-3 text-ni-muted">@{n.uploadedBy.username}</td>
                      <td className="p-3 text-ni-muted">
                        {n.fileFormat} &bull; {formatFileSize(n.fileSizeBytes)}
                      </td>
                      <td className="p-3">
                        <select
                          value={n.status}
                          onChange={(e) => handleNoteStatus(n.id, e.target.value as NoteStatus)}
                          className="bg-ni-surface border border-ni-border px-2 py-1 text-white"
                        >
                          <option value="PUBLISHED">PUBLISHED</option>
                          <option value="FLAGGED">FLAGGED</option>
                          <option value="REMOVED">REMOVED</option>
                        </select>
                      </td>
                      <td className="p-3 text-ni-muted">{n.aiIndexed ? 'Indexed' : 'Pending'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleReindexNote(n.id)}
                          className="ni-btn-secondary py-1 px-2.5 text-[11px]"
                        >
                          <RefreshCw className="w-3 h-3" /> Re-index AI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Manage Categories & Merge Duplicates */}
        {tab === 'categories' && (
          <div className="space-y-6">
            <form
              onSubmit={handleMergeCategories}
              className="bg-ni-black border border-ni-border p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-white" />
                <h2 className="text-sm font-medium text-white">Merge Duplicate Categories</h2>
              </div>
              <p className="text-xs text-ni-muted">
                Re-link all notes and subcategories from a duplicate source category into a
                canonical target category without creating duplicate note records.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs text-ni-muted mb-1">Source (Will be removed)</label>
                  <select
                    value={mergeSourceId}
                    onChange={(e) => setMergeSourceId(e.target.value)}
                    className="ni-input"
                  >
                    <option value="">Select duplicate category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.noteCount} notes)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-ni-muted mb-1">Target (Canonical category)</label>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="ni-input"
                  >
                    <option value="">Select target category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.noteCount} notes)
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="ni-btn-primary">
                  <GitMerge className="w-4 h-4" /> Merge Categories
                </button>
              </div>
            </form>

            <div className="bg-ni-black border border-ni-border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-ni-surface border-b border-ni-border text-ni-muted uppercase">
                  <tr>
                    <th className="p-3">Category</th>
                    <th className="p-3">Parent</th>
                    <th className="p-3">Slug</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ni-border">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-ni-surface">
                      <td className="p-3 font-medium text-white flex items-center gap-2">
                        <span
                          className="w-3 h-3 inline-block shrink-0"
                          style={{ backgroundColor: cat.accentColor }}
                        />
                        {cat.name}
                      </td>
                      <td className="p-3 text-ni-muted">{cat.parentName || 'Root'}</td>
                      <td className="p-3 text-ni-subtle font-mono">{cat.slug}</td>
                      <td className="p-3 text-white">{cat.noteCount}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          disabled={cat.noteCount > 0}
                          title={cat.noteCount > 0 ? 'Merge before deleting' : 'Delete empty category'}
                          className="ni-btn-secondary py-1 px-2.5 text-[11px]"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Manage Users (Admin Only) */}
        {tab === 'users' && isAdmin && (
          <div className="space-y-4">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by username, email, or name..."
              className="ni-input max-w-md"
            />
            <div className="bg-ni-black border border-ni-border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-ni-surface border-b border-ni-border text-ni-muted uppercase">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ni-border">
                  {(usersPage?.items || []).map((u) => (
                    <tr key={u.id} className="hover:bg-ni-surface">
                      <td className="p-3 text-white font-medium">
                        {u.fullName} <span className="text-ni-subtle">(@{u.username})</span>
                      </td>
                      <td className="p-3 text-ni-muted">{u.email}</td>
                      <td className="p-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleUserUpdate(u.id, { role: e.target.value as Role })}
                          className="bg-ni-surface border border-ni-border px-2 py-1 text-white"
                        >
                          <option value="USER">USER</option>
                          <option value="MODERATOR">MODERATOR</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="p-3 text-white">{u.active ? 'Active' : 'Suspended'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleUserUpdate(u.id, { active: !u.active })}
                          className="ni-btn-secondary py-1 px-2.5 text-[11px]"
                        >
                          {u.active ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. Platform Activity / Audit Log */}
        {tab === 'audit' && (
          <div className="bg-ni-black border border-ni-border overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-ni-surface border-b border-ni-border text-ni-muted uppercase">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ni-border">
                {(auditPage?.items || []).map((log) => (
                  <tr key={log.id} className="hover:bg-ni-surface">
                    <td className="p-3 text-ni-subtle whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="p-3 text-white">@{log.actorUsername}</td>
                    <td className="p-3 font-mono text-white">{log.action}</td>
                    <td className="p-3 text-ni-muted">{log.targetType}</td>
                    <td className="p-3 text-ni-muted">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

const StatTile: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({
  label,
  value,
  icon,
}) => (
  <div className="bg-ni-black border border-ni-border p-4">
    <div className="flex items-center justify-between text-xs text-ni-muted mb-1">
      <span>{label}</span>
      {icon}
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
  </div>
);
