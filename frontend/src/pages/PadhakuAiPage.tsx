import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Bot,
  Check,
  Copy,
  FileUp,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { aiApi, extractErrorMessage, notesApi } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { AiMessage, ExtractedDocument, ReferencedNote } from '../types';
import { Layout } from '../components/layout/Layout';

const STUDY_MODES = [
  { key: 'GENERAL', label: 'Ask Anything' },
  { key: 'SUMMARY', label: 'Summarize' },
  { key: 'SIMPLIFY', label: 'Explain Simply' },
  { key: 'MCQ', label: 'Generate MCQs' },
  { key: 'PRACTICE', label: 'Practice Qs' },
  { key: 'REVISION', label: 'Revision Notes' },
  { key: 'CODE', label: 'Explain Code' },
];

const STARTER_PROMPTS = [
  'Explain inheritance and runtime polymorphism in Java with an example.',
  'Generate 5 SSC CGL Quantitative Aptitude MCQs on Percentage and Profit & Loss.',
  'Summarize DBMS Normalization from 1NF to BCNF for quick exam revision.',
  'Explain Coffman deadlock conditions in Operating Systems in simple terms.',
];

export const PadhakuAiPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialNoteId = searchParams.get('noteId');

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('GENERAL');
  const [selectedNoteId, setSelectedNoteId] = useState<string>(initialNoteId || '');
  const [adHocDoc, setAdHocDoc] = useState<ExtractedDocument | null>(null);
  const [extractingDoc, setExtractingDoc] = useState(false);

  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingRefs, setStreamingRefs] = useState<ReferencedNote[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const { data: aiStatus } = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => aiApi.getStatus(),
    refetchInterval: 30000,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['ai', 'conversations'],
    queryFn: () => aiApi.listConversations(),
    enabled: isAuthenticated,
  });

  const { data: availableNotesPage } = useQuery({
    queryKey: ['notes', 'for-ai-picker'],
    queryFn: () => notesApi.getRecentFeed(0, 30),
  });

  const availableNotes = availableNotesPage?.items || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // If navigated from a specific Note Detail page (?noteId=...), start/focus a conversation for it
  useEffect(() => {
    if (!isAuthenticated) return;
    if (initialNoteId) {
      setSelectedNoteId(initialNoteId);
      aiApi
        .createConversation({ focusedNoteId: initialNoteId })
        .then((conv) => {
          setActiveConvId(conv.id);
          setMessages(conv.messages);
          void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
          setSearchParams({}, { replace: true });
        })
        .catch(() => {});
    }
  }, [initialNoteId, isAuthenticated, queryClient, setSearchParams]);

  // Load selected conversation details
  const openConversation = async (convId: string) => {
    setError(null);
    setActiveConvId(convId);
    setMobileSidebarOpen(false);
    try {
      const detail = await aiApi.getConversation(convId);
      setMessages(detail.messages);
      setSelectedNoteId(detail.focusedNoteId || '');
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleNewConversation = async () => {
    setError(null);
    setActiveConvId(null);
    setMessages([]);
    setAdHocDoc(null);
    setMobileSidebarOpen(false);
  };

  const handleClearConversation = async () => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    try {
      await aiApi.clearConversation(activeConvId);
      setMessages([]);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await aiApi.deleteConversation(convId);
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
      await queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  const handleUploadAdHocDoc = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setExtractingDoc(true);
    try {
      const extracted = await aiApi.extractDocument(file);
      setAdHocDoc(extracted);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not extract document text. Verify AI service is running.'));
    } finally {
      setExtractingDoc(false);
    }
  };

  const handleSend = async (promptOverride?: string) => {
    const question = (promptOverride ?? input).trim();
    if (!question || streaming) return;
    setError(null);

    let convId = activeConvId;
    try {
      if (!convId) {
        const created = await aiApi.createConversation({
          title: question.slice(0, 70),
          focusedNoteId: selectedNoteId || undefined,
        });
        convId = created.id;
        setActiveConvId(created.id);
        await queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to start conversation'));
      return;
    }

    const optimisticUser: AiMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'USER',
      content: question,
      referencedNotes: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');
    setStreaming(true);
    setStreamingText('');
    setStreamingRefs([]);

    await aiApi.streamMessage(
      convId,
      {
        message: question,
        focusedNoteId: selectedNoteId || null,
        mode,
        adHocDocumentText: adHocDoc?.extractedText || null,
        adHocDocumentName: adHocDoc?.filename || null,
      },
      {
        onToken: (token) => {
          setStreamingText((prev) => prev + token);
        },
        onReferences: (refs) => {
          setStreamingRefs(refs);
        },
        onDone: (finalMessage) => {
          setMessages((prev) => [...prev, finalMessage]);
          setStreamingText('');
          setStreamingRefs([]);
          setStreaming(false);
          void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
        },
        onError: (msg) => {
          setError(msg);
          setStreaming(false);
          setStreamingText('');
        },
      }
    );
  };

  const handleRegenerate = async () => {
    if (!activeConvId || streaming) return;
    setError(null);
    setStreaming(true);
    try {
      const regenerated = await aiApi.regenerate(activeConvId);
      setMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === 'ASSISTANT') {
          copy[copy.length - 1] = regenerated;
        } else {
          copy.push(regenerated);
        }
        return copy;
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setStreaming(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="bg-ni-black border border-ni-border p-10">
            <Bot className="w-10 h-10 text-white mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-1">Padhaku AI</h1>
            <p className="text-sm text-ni-muted mb-6">
              &ldquo;Padhai ko smart banao.&rdquo; &mdash; Sign in to chat with NotesIndia&apos;s
              local-LLM RAG assistant, save chat history, generate MCQs, and ask questions about any
              uploaded PDF or note.
            </p>
            <div className="flex justify-center gap-3">
              <Link to="/login?redirect=/padhaku-ai" className="ni-btn-primary">
                Log in to Padhaku AI
              </Link>
              <Link to="/register" className="ni-btn-secondary">
                Create Free Account
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideFooter>
      <div className="h-[calc(100vh-4rem)] flex bg-ni-bg overflow-hidden">
        {/* Left Sidebar — Conversations */}
        <aside
          className={`${
            mobileSidebarOpen ? 'fixed inset-y-16 left-0 z-30 w-72 flex' : 'hidden md:flex md:w-72'
          } flex-col bg-ni-black border-r border-ni-border shrink-0`}
        >
          <div className="p-4 border-b border-ni-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-base font-bold text-white flex items-center gap-2">
                  <Bot className="w-4 h-4" /> Padhaku AI
                </h1>
                <p className="text-[11px] text-ni-muted">Padhai ko smart banao.</p>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="md:hidden text-ni-muted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button onClick={handleNewConversation} className="w-full ni-btn-primary py-2 text-xs">
              <Plus className="w-4 h-4" /> New Conversation
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-xs text-ni-subtle p-3 text-center">
                No past chats yet. Ask a question to begin.
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  className={`group flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer border transition-colors ${
                    activeConvId === conv.id
                      ? 'bg-ni-surface2 border-white text-white'
                      : 'bg-transparent border-transparent text-ni-muted hover:bg-ni-surface hover:text-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs font-medium truncate">{conv.title}</span>
                    </div>
                    <div className="text-[10px] text-ni-subtle mt-0.5 truncate">
                      {conv.focusedNoteTitle ? `Note: ${conv.focusedNoteTitle}` : formatRelativeTime(conv.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    title="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 text-ni-subtle hover:text-white p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Local LLM Engine Status Footer */}
          <div className="p-3 border-t border-ni-border bg-ni-surface text-[11px] text-ni-muted space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Local LLM Engine</span>
              <span className="px-1.5 py-0.5 bg-ni-black border border-ni-border text-white text-[10px] uppercase">
                {aiStatus?.available ? 'Online' : 'Standby'}
              </span>
            </div>
            <div className="truncate">
              Model: <span className="text-white">{aiStatus?.activeModel || 'qwen3:8b'}</span>
            </div>
            <div>
              RAG Index: <span className="text-white">{aiStatus?.indexedChunks ?? 0}</span> chunks (
              {aiStatus?.vectorStore || 'faiss'})
            </div>
          </div>
        </aside>

        {/* Main Chat Workspace */}
        <section className="flex-1 flex flex-col min-w-0">
          {/* Context & Controls Topbar */}
          <div className="bg-ni-surface border-b border-ni-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden ni-btn-secondary py-1.5 px-2.5 text-xs"
              >
                Chats
              </button>

              {/* Focus on Specific Uploaded Note */}
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-ni-muted shrink-0" />
                <select
                  value={selectedNoteId}
                  onChange={(e) => setSelectedNoteId(e.target.value)}
                  aria-label="Select study note context"
                  className="bg-ni-black border border-ni-border px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white max-w-[240px]"
                >
                  <option value="">Context: All NotesIndia Notes (RAG)</option>
                  {availableNotes.map((n) => (
                    <option key={n.id} value={n.id}>
                      Note: {n.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ad-Hoc PDF / Document Upload */}
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md"
                onChange={(e) => handleUploadAdHocDoc(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                disabled={extractingDoc}
                onClick={() => pdfInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-ni-black border border-ni-border text-white hover:border-white"
              >
                <FileUp className="w-3.5 h-3.5" />
                {extractingDoc ? 'Extracting...' : 'Attach PDF / Note'}
              </button>

              {adHocDoc && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-ni-surface2 border border-white text-white">
                  {adHocDoc.filename} ({adHocDoc.pageCount}p)
                  <button
                    type="button"
                    onClick={() => setAdHocDoc(null)}
                    className="text-ni-muted hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <>
                  <button
                    type="button"
                    disabled={streaming}
                    onClick={handleRegenerate}
                    className="ni-btn-ghost py-1.5 px-2.5 text-xs"
                    title="Regenerate last response"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </button>
                  <button
                    type="button"
                    disabled={streaming}
                    onClick={handleClearConversation}
                    className="ni-btn-ghost py-1.5 px-2.5 text-xs"
                    title="Clear conversation messages"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Messages Viewport */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.length === 0 && !streaming ? (
                <div className="py-10 text-center space-y-6">
                  <div>
                    <div className="w-12 h-12 bg-ni-black border border-ni-border mx-auto mb-3 flex items-center justify-center">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Padhaku AI</h2>
                    <p className="text-sm text-ni-muted mt-1">
                      Padhai ko smart banao. Ask academic questions, generate MCQs, explain code, or
                      study directly from NotesIndia&apos;s notes repository.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="bg-ni-black border border-ni-border hover:border-white p-4 text-xs text-ni-muted hover:text-white transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-5 border ${
                        msg.role === 'USER'
                          ? 'bg-ni-surface2 border-ni-border ml-8 sm:ml-16'
                          : 'bg-ni-black border-ni-border mr-2 sm:mr-10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-ni-muted">
                          {msg.role === 'USER' ? 'You' : `Padhaku AI${msg.modelUsed ? ` · ${msg.modelUsed}` : ''}`}
                        </span>
                        {msg.role === 'ASSISTANT' && (
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 text-[11px] text-ni-subtle hover:text-white"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Copy
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <div className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>

                      {/* Referenced Notes Citations */}
                      {msg.referencedNotes && msg.referencedNotes.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-ni-border">
                          <p className="text-[11px] uppercase tracking-wider text-ni-subtle mb-2">
                            Referenced NotesIndia Notes
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {msg.referencedNotes.map((ref) => (
                              <Link
                                key={ref.noteId}
                                to={`/notes/${ref.noteId}`}
                                className="block p-2.5 bg-ni-surface border border-ni-border hover:border-white transition-colors"
                              >
                                <div className="text-xs font-medium text-white truncate">
                                  {ref.title}
                                  {ref.pageNumbers && ref.pageNumbers.length > 0 && (
                                    <span className="ml-1.5 text-[10px] text-ni-muted font-normal">
                                      (p. {ref.pageNumbers.join(', ')})
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-ni-muted line-clamp-2 mt-0.5">
                                  {ref.snippet}
                                </p>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Live Streaming Assistant Bubble */}
                  {streaming && (
                    <div className="bg-ni-black border border-white p-5 mr-2 sm:mr-10">
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-ni-muted mb-2">
                        Padhaku AI &middot; Thinking...
                      </div>
                      <div className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                        {streamingText || 'Retrieving relevant NotesIndia materials...'}
                      </div>
                      {streamingRefs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-ni-border flex flex-wrap gap-1.5">
                          {streamingRefs.map((ref) => (
                            <span
                              key={ref.noteId}
                              className="text-[11px] px-2 py-0.5 bg-ni-surface border border-ni-border text-ni-muted"
                            >
                              Ref: {ref.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="p-3 bg-ni-black border border-white text-xs text-white">{error}</div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Bottom Composer */}
          <div className="bg-ni-surface border-t border-ni-border px-4 py-3">
            <div className="max-w-3xl mx-auto space-y-2.5">
              {/* Study Mode Chips */}
              <div className="flex flex-wrap gap-1.5">
                {STUDY_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    className={`px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                      mode === m.key
                        ? 'bg-white text-black border-white'
                        : 'bg-ni-black text-ni-muted border-ni-border hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="flex gap-2"
              >
                <textarea
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Ask Padhaku AI anything about your exams, code, or NotesIndia documents... (Enter to send)"
                  className="ni-input flex-1 resize-none"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="ni-btn-primary px-5 self-stretch"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};
