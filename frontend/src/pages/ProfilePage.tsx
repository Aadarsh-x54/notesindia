import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, Edit3, Trash2, Upload, User as UserIcon } from 'lucide-react';
import { authApi, extractErrorMessage, notesApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { getGuestRecentlyViewed } from '../lib/recentlyViewed';
import { useAuth } from '../context/AuthContext';
import type { NoteItem } from '../types';
import { Layout } from '../components/layout/Layout';
import { NoteCard } from '../components/notes/NoteCard';
import { EditNoteModal } from '../components/notes/EditNoteModal';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';

export const ProfilePage: React.FC = () => {
  const { username } = useParams();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const isOwnProfile = !username || (user && user.username.toLowerCase() === username.toLowerCase());
  const [tab, setTab] = useState<'uploads' | 'recent' | 'settings'>('uploads');
  const [page, setPage] = useState(0);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);

  // Settings state
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [institution, setInstitution] = useState(user?.institution || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setBio(user.bio || '');
      setInstitution(user.institution || '');
    }
  }, [user]);

  const { data: publicUser } = useQuery({
    queryKey: ['public-user', username],
    queryFn: () => authApi.getPublicProfile(username!),
    enabled: Boolean(username && !isOwnProfile),
  });

  const { data: uploadsPage, isLoading: uploadsLoading } = useQuery({
    queryKey: ['profile-uploads', isOwnProfile ? 'me' : username, page],
    queryFn: () =>
      isOwnProfile ? notesApi.getMyUploads(page, 9) : notesApi.getUserUploads(username!, page, 9),
    enabled: Boolean(isOwnProfile ? user : username),
  });

  const { data: recentlyViewed = [] } = useQuery({
    queryKey: ['notes', 'recently-viewed'],
    queryFn: () => notesApi.getRecentlyViewed(9),
    enabled: Boolean(isOwnProfile && user && tab === 'recent'),
  });

  const displayedRecent = recentlyViewed.length > 0 ? recentlyViewed : getGuestRecentlyViewed();
  const displayProfile = isOwnProfile ? user : publicUser;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await authApi.updateMe({
        fullName: fullName.trim(),
        bio: bio.trim() || undefined,
        institution: institution.trim() || undefined,
      });
      await refreshUser();
      setProfileMsg('Profile updated successfully.');
    } catch (err) {
      setProfileMsg(extractErrorMessage(err));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPwdMsg('Password changed successfully.');
    } catch (err) {
      setPwdMsg(extractErrorMessage(err));
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Delete this note permanently from public view?')) return;
    await notesApi.remove(noteId);
    await queryClient.invalidateQueries({ queryKey: ['profile-uploads'] });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Profile Header Card */}
        {displayProfile && (
          <div className="bg-ni-black border border-ni-border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-ni-surface2 border border-ni-border flex items-center justify-center shrink-0">
                <UserIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white">{displayProfile.fullName}</h1>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-ni-surface2 border border-ni-border text-white">
                    {displayProfile.role}
                  </span>
                </div>
                <p className="text-xs text-ni-muted">@{displayProfile.username}</p>
                {displayProfile.bio && (
                  <p className="text-sm text-neutral-300 mt-2 max-w-2xl">{displayProfile.bio}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-ni-subtle">
                  {displayProfile.institution && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> {displayProfile.institution}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Joined {formatDateTime(displayProfile.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {isOwnProfile && (
              <Link to="/upload" className="ni-btn-primary shrink-0">
                <Upload className="w-4 h-4" /> Upload New Note
              </Link>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-ni-border gap-1">
          <button
            onClick={() => setTab('uploads')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'uploads'
                ? 'border-white text-white'
                : 'border-transparent text-ni-muted hover:text-white'
            }`}
          >
            {isOwnProfile ? 'My Upload History' : 'Uploaded Notes'}
          </button>

          {isOwnProfile && (
            <>
              <button
                onClick={() => setTab('recent')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'recent'
                    ? 'border-white text-white'
                    : 'border-transparent text-ni-muted hover:text-white'
                }`}
              >
                Recently Viewed
              </button>
              <button
                onClick={() => setTab('settings')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'settings'
                    ? 'border-white text-white'
                    : 'border-transparent text-ni-muted hover:text-white'
                }`}
              >
                Account Settings
              </button>
            </>
          )}
        </div>

        {/* Uploads Tab */}
        {tab === 'uploads' && (
          <div>
            {uploadsLoading ? (
              <div className="text-sm text-ni-muted py-8">Loading uploads...</div>
            ) : !uploadsPage || uploadsPage.items.length === 0 ? (
              <EmptyState
                title="No uploaded notes yet"
                description={
                  isOwnProfile
                    ? 'Notes you share with the community will appear here where you can edit descriptions, categories, or manage them.'
                    : 'This contributor has not published any notes yet.'
                }
                action={
                  isOwnProfile ? (
                    <Link to="/upload" className="ni-btn-primary">
                      Upload Your First Note
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uploadsPage.items.map((note) => (
                    <div key={note.id} className="space-y-1.5">
                      <NoteCard note={note} />
                      {isOwnProfile && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingNote(note)}
                            className="ni-btn-secondary py-1 px-2.5 text-xs"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="ni-btn-secondary py-1 px-2.5 text-xs"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination
                  page={uploadsPage.page}
                  totalPages={uploadsPage.totalPages}
                  hasPrevious={uploadsPage.hasPrevious}
                  hasNext={uploadsPage.hasNext}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        )}

        {/* Recently Viewed Tab */}
        {tab === 'recent' && isOwnProfile && (
          <div>
            {displayedRecent.length === 0 ? (
              <EmptyState
                title="No recently viewed notes"
                description="Notes you inspect on NotesIndia will appear here for quick revision access."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedRecent.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {tab === 'settings' && isOwnProfile && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleSaveProfile} className="bg-ni-black border border-ni-border p-6 space-y-4">
              <h2 className="text-base font-medium text-white">Edit Profile</h2>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="ni-input"
                />
              </div>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Institution / Exam Focus</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="ni-input"
                />
              </div>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Bio</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="ni-input"
                />
              </div>
              {profileMsg && <p className="text-xs text-white bg-ni-surface p-2.5 border border-ni-border">{profileMsg}</p>}
              <button type="submit" className="ni-btn-primary">
                Save Profile
              </button>
            </form>

            <form onSubmit={handleChangePassword} className="bg-ni-black border border-ni-border p-6 space-y-4">
              <h2 className="text-base font-medium text-white">Change Password</h2>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="ni-input"
                />
              </div>
              <div>
                <label className="block text-xs text-ni-muted mb-1">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="ni-input"
                />
              </div>
              {pwdMsg && <p className="text-xs text-white bg-ni-surface p-2.5 border border-ni-border">{pwdMsg}</p>}
              <button type="submit" className="ni-btn-secondary">
                Update Password
              </button>
            </form>
          </div>
        )}
      </div>

      {editingNote && (
        <EditNoteModal
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onUpdated={() => {
            void queryClient.invalidateQueries({ queryKey: ['profile-uploads'] });
          }}
        />
      )}
    </Layout>
  );
};
