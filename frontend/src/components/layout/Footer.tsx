import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-ni-black border-t border-ni-border mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 bg-white text-black flex items-center justify-center font-bold text-xs">
                NI
              </div>
              <span className="text-base font-bold text-white">NotesIndia</span>
            </div>
            <p className="text-sm text-ni-muted max-w-md leading-relaxed">
              A centralized, community-driven educational notes repository paired with Padhaku AI
              (&ldquo;Padhai ko smart banao.&rdquo;) — built for students, competitive exam aspirants,
              programmers, and self-learners across India.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white mb-3">
              Platform
            </h3>
            <ul className="space-y-2 text-sm text-ni-muted">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Recent Notes Feed
                </Link>
              </li>
              <li>
                <Link to="/categories" className="hover:text-white transition-colors">
                  Explore Categories
                </Link>
              </li>
              <li>
                <Link to="/search" className="hover:text-white transition-colors">
                  Global Search
                </Link>
              </li>
              <li>
                <Link to="/upload" className="hover:text-white transition-colors">
                  Upload Notes
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white mb-3">
              Learning Assistant
            </h3>
            <ul className="space-y-2 text-sm text-ni-muted">
              <li>
                <Link to="/padhaku-ai" className="hover:text-white transition-colors">
                  Padhaku AI Chat
                </Link>
              </li>
              <li>
                <Link to="/bookmarks" className="hover:text-white transition-colors">
                  Saved Bookmarks
                </Link>
              </li>
              <li>
                <Link to="/profile" className="hover:text-white transition-colors">
                  Upload History &amp; Profile
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-ni-border mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ni-subtle">
          <p>&copy; {new Date().getFullYear()} NotesIndia. Open Educational Knowledge Platform.</p>
          <p>Chronological Feed &bull; Dynamic Multi-Category Graph &bull; Local-LLM RAG</p>
        </div>
      </div>
    </footer>
  );
};
