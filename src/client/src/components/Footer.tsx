import React from 'react';
import { Shield, FileText, Info, Mail, Heart, Github } from 'lucide-react';
import { useLegalModals } from './LegalPages';

export const Footer: React.FC = () => {
  const { openPrivacyPolicy, openTermsOfService, openAbout } = useLegalModals();

  return (
    <footer className="bg-slate-950 border-t border-slate-800 py-4 px-6 shrink-0">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <span>&copy; {new Date().getFullYear()} MTGate</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">Not affiliated with Wizards of the Coast</span>
          <span className="hidden sm:inline">•</span>
          <span className="flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-red-500 fill-red-500" /> in Italy
          </span>
          <span className="hidden sm:inline">•</span>
          <a
            href="https://github.com/dnviti/mtg-online-web"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-purple-400 transition-colors"
          >
            <Github className="w-3 h-3" /> Open Source
          </a>
        </div>

        <nav className="flex items-center gap-4 text-xs">
          <button
            onClick={openAbout}
            className="flex items-center gap-1.5 text-slate-400 hover:text-purple-400 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>About</span>
          </button>

          <button
            onClick={openPrivacyPolicy}
            className="flex items-center gap-1.5 text-slate-400 hover:text-purple-400 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </button>

          <button
            onClick={openTermsOfService}
            className="flex items-center gap-1.5 text-slate-400 hover:text-purple-400 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service</span>
          </button>

          <a
            href="mailto:mtgate.supp@gmail.com"
            className="flex items-center gap-1.5 text-slate-400 hover:text-purple-400 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Contact</span>
          </a>
        </nav>
      </div>
    </footer>
  );
};
