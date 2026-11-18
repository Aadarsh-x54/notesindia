import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Bookmark,
  Bot,
  FolderTree,
  LogOut,
  Menu,
  Search,
  Shield,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, isStaff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      setMobileMenuOpen(false);
    } else {
      navigate('/search');
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
    navigate('/');
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <header className="sticky top-0 z-40 bg-ni-black border-b border-ni-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 text-white hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-sm tracking-tight">
              NI
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-lg font-bold tracking-tight text-white">NotesIndia</span>
              <span className="text-[10px] uppercase tracking-widest text-ni-muted hidden sm:block">
                Community Notes
              </span>
            </div>
          </Link>

          {/* Global Search Bar (Desktop) */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-ni-subtle absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search notes, SSC CGL, Java OOP, DBMS, Python..."
                aria-label="Global search notes"
                className="w-full bg-ni-surface border border-ni-border pl-10 pr-20 py-2 text-sm text-white placeholder-ni-subtle focus:outline-none focus:border-white transition-colors"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-ni-surface2 hover:bg-ni-surface3 text-white text-xs font-medium px-3 py-1 border border-ni-border transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Desktop Navigation Actions */}
          <nav className="hidden lg:flex items-center gap-1.5">
            <Link
              to="/categories"
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                isActive('/categories')
                  ? 'text-white bg-ni-surface2'
                  : 'text-ni-muted hover:text-white hover:bg-ni-surface'
              }`}
            >
              <FolderTree className="w-4 h-4" />
              Categories
            </Link>

            <Link
              to="/padhaku-ai"
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border transition-colors ${
                isActive('/padhaku-ai')
                  ? 'bg-white text-black border-white'
                  : 'bg-ni-surface text-white border-ni-border hover:border-white'
              }`}
            >
              <Bot className="w-4 h-4" />
              Padhaku AI
            </Link>

            <Link to="/upload" className="ni-btn-primary py-2 px-3.5">
              <Upload className="w-4 h-4" />
              Upload Notes
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-1 pl-2 ml-1 border-l border-ni-border">
                <Link
                  to="/bookmarks"
                  title="Bookmarks"
                  className={`p-2 transition-colors ${
                    isActive('/bookmarks') ? 'text-white bg-ni-surface2' : 'text-ni-muted hover:text-white'
                  }`}
                >
                  <Bookmark className="w-4 h-4" />
                </Link>
                {isStaff && (
                  <Link
                    to="/admin"
                    title="Admin Dashboard"
                    className={`p-2 transition-colors ${
                      isActive('/admin') ? 'text-white bg-ni-surface2' : 'text-ni-muted hover:text-white'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to="/profile"
                  className={`px-2.5 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                    isActive('/profile') ? 'text-white bg-ni-surface2' : 'text-ni-muted hover:text-white'
                  }`}
                >
                  <UserIcon className="w-4 h-4" />
                  <span className="max-w-[96px] truncate">{user?.username}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="p-2 text-ni-muted hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-ni-border">
                <Link to="/login" className="ni-btn-ghost">
                  Log in
                </Link>
                <Link to="/register" className="ni-btn-secondary py-2 px-3">
                  Sign up
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile Controls */}
          <div className="flex lg:hidden items-center gap-2">
            <Link
              to="/padhaku-ai"
              className="p-2 bg-ni-surface border border-ni-border text-white"
              aria-label="Padhaku AI"
            >
              <Bot className="w-4 h-4" />
            </Link>
            <Link
              to="/upload"
              className="p-2 bg-white text-black"
              aria-label="Upload Notes"
            >
              <Upload className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="p-2 text-white border border-ni-border bg-ni-surface"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <form onSubmit={handleSearchSubmit} className="md:hidden pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-ni-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search notes, topics, exams..."
              className="w-full bg-ni-surface border border-ni-border pl-9 pr-16 py-2 text-sm text-white placeholder-ni-subtle focus:outline-none focus:border-white"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-ni-surface2 text-white text-xs px-2.5 py-1 border border-ni-border"
            >
              Go
            </button>
          </div>
        </form>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-ni-surface border-t border-ni-border px-4 py-3 space-y-1">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
          >
            <BookOpen className="w-4 h-4" /> Recent Notes Feed
          </Link>
          <Link
            to="/categories"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
          >
            <FolderTree className="w-4 h-4" /> Explore Categories
          </Link>
          <Link
            to="/padhaku-ai"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
          >
            <Bot className="w-4 h-4" /> Padhaku AI — Padhai ko smart banao
          </Link>
          <Link
            to="/upload"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
          >
            <Upload className="w-4 h-4" /> Upload Notes
          </Link>

          <div className="border-t border-ni-border my-2 pt-2">
            {isAuthenticated ? (
              <>
                <Link
                  to="/bookmarks"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
                >
                  <Bookmark className="w-4 h-4" /> Bookmarks
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
                >
                  <UserIcon className="w-4 h-4" /> Profile ({user?.username})
                </Link>
                {isStaff && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-white hover:bg-ni-surface2"
                  >
                    <Shield className="w-4 h-4" /> Admin Dashboard
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ni-muted hover:text-white hover:bg-ni-surface2"
                >
                  <LogOut className="w-4 h-4" /> Log out
                </button>
              </>
            ) : (
              <div className="flex gap-2 px-3 pt-1">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 ni-btn-secondary text-center"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 ni-btn-primary text-center"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
