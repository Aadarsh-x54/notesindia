import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Upload, X } from 'lucide-react';
import { extractErrorMessage, notesApi } from '../lib/api';
import { formatFileSize } from '../lib/format';
import type { NewCategoryInput } from '../types';
import { Layout } from '../components/layout/Layout';
import { CategorySelector } from '../components/notes/CategorySelector';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md'];
const MAX_BYTES = 50 * 1024 * 1024;

export const UploadNotePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [institution, setInstitution] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [newCategories, setNewCategories] = useState<NewCategoryInput[]>([]);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFilePick = (picked: File | null) => {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    const lower = picked.name.toLowerCase();
    const validExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!validExt) {
      setError(`Unsupported file type. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError('File exceeds the 50 MB size limit.');
      return;
    }
    setFile(picked);
    if (!title.trim()) {
      const base = picked.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      setTitle(base);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Please select a note file to upload.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    if (categoryIds.length === 0 && newCategories.length === 0) {
      setError('Select at least one existing category or create a new category.');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const created = await notesApi.upload(
        {
          file,
          title: title.trim(),
          description: description.trim(),
          subject: subject.trim() || undefined,
          institution: institution.trim() || undefined,
          authorName: authorName.trim() || undefined,
          categoryIds,
          newCategories,
        },
        setProgress
      );
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      navigate(`/notes/${created.id}`);
    } catch (err) {
      setError(extractErrorMessage(err, 'Upload failed. Please verify the file and try again.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Upload Educational Notes</h1>
          <p className="text-sm text-ni-muted mt-1">
            Attach your study material, assign one or multiple categories (or create new ones), and
            publish directly to the NotesIndia chronological feed &amp; Padhaku AI knowledge base.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-ni-surface border border-ni-border p-6 space-y-6">
          {/* File Upload Dropzone */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ni-muted mb-2">
              1. Educational File *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(',')}
              onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
              className="hidden"
            />

            {!file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilePick(e.dataTransfer.files?.[0] || null);
                }}
                className="bg-ni-black border border-dashed border-ni-border hover:border-white transition-colors p-8 text-center cursor-pointer"
              >
                <FileUp className="w-8 h-8 text-ni-muted mx-auto mb-2" />
                <p className="text-sm text-white font-medium">
                  Click to choose a file or drag and drop here
                </p>
                <p className="text-xs text-ni-subtle mt-1">
                  Supported: PDF, DOCX, DOC, PPTX, PPT, TXT, MD &bull; Max 50 MB
                </p>
              </div>
            ) : (
              <div className="bg-ni-black border border-white p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{file.name}</p>
                    <p className="text-xs text-ni-muted">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleFilePick(null)}
                  className="text-ni-muted hover:text-white p-1"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Core Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-ni-muted mb-1.5">
                2. Note Title *
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. SSC CGL Tier-1 & Tier-2 Quantitative Aptitude Complete Notes"
                className="ni-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-ni-muted mb-1.5">
                3. Description *
              </label>
              <textarea
                required
                minLength={10}
                maxLength={5000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what topics, chapters, formulas, or exam syllabus this note covers..."
                className="ni-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-ni-muted mb-1">Subject (Optional)</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Object-Oriented Programming"
                  className="ni-input"
                />
              </div>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Institution (Optional)</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. IIT / DU / Self Study"
                  className="ni-input"
                />
              </div>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Author Name (Optional)</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Defaults to your name"
                  className="ni-input"
                />
              </div>
            </div>
          </div>

          {/* Dynamic Multi-Category Assignment */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ni-muted mb-1">
              4. Assign Categories (Select One, Multiple, or Create New) *
            </label>
            <p className="text-xs text-ni-subtle mb-3">
              One note can belong to multiple categories simultaneously without creating duplicate
              copies. New categories immediately appear in NotesIndia&apos;s Category Explorer.
            </p>
            <CategorySelector
              selectedIds={categoryIds}
              onSelectedIdsChange={setCategoryIds}
              newCategories={newCategories}
              onNewCategoriesChange={setNewCategories}
            />
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-ni-muted">
                <span>Uploading and validating file...</span>
                <span className="text-white">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-ni-black border border-ni-border">
                <div
                  className="h-full bg-white transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-ni-black border border-white text-xs text-white">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-ni-border">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="ni-btn-secondary"
              disabled={uploading}
            >
              Cancel
            </button>
            <button type="submit" disabled={uploading} className="ni-btn-primary">
              <Upload className="w-4 h-4" />
              {uploading ? 'Publishing...' : 'Publish Note'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};
