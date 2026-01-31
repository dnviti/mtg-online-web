import React, { useState } from 'react';
import { X, Shield, FileText, Mail } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-slate-300 text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
};

export const PrivacyPolicy: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <LegalModal isOpen={isOpen} onClose={onClose} title="Privacy Policy">
    <div className="space-y-6">
      <p className="text-slate-400">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">1. Introduction</h3>
        <p>
          Welcome to MTGate ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data.
          This privacy policy explains how we collect, use, and safeguard your information when you use our Magic: The Gathering
          draft simulator service.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h3>
        <p className="mb-2">We collect the following types of information:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li><strong>Account Information:</strong> Username and password when you create an account</li>
          <li><strong>Usage Data:</strong> Information about how you use our service, including draft history and deck configurations</li>
          <li><strong>Technical Data:</strong> IP address, browser type, device information, and cookies</li>
          <li><strong>Communication Data:</strong> Messages sent through our chat feature during gameplay</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h3>
        <p className="mb-2">We use your information to:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Provide and maintain our service</li>
          <li>Manage your account and preferences</li>
          <li>Enable multiplayer features and real-time gameplay</li>
          <li>Improve our service and develop new features</li>
          <li>Display personalized advertisements (for non-premium users)</li>
          <li>Communicate with you about updates or changes</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">4. Cookies and Advertising</h3>
        <p className="mb-2">
          We use cookies and similar tracking technologies to enhance your experience. These include:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li><strong>Essential Cookies:</strong> Required for the service to function (authentication, preferences)</li>
          <li><strong>Analytics Cookies:</strong> Help us understand how users interact with our service</li>
          <li><strong>Advertising Cookies:</strong> Used by Google AdSense to display relevant advertisements</li>
        </ul>
        <p className="mt-2">
          We use Google AdSense to display advertisements. Google may use cookies to personalize ads based on your browsing history.
          You can opt out of personalized advertising by visiting{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">
            Google Ads Settings
          </a>.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">5. Data Sharing</h3>
        <p className="mb-2">We may share your information with:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li><strong>Service Providers:</strong> Third parties that help us operate our service (hosting, analytics)</li>
          <li><strong>Advertising Partners:</strong> Google AdSense for displaying advertisements</li>
          <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
        </ul>
        <p className="mt-2">We do not sell your personal information to third parties.</p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">6. Data Security</h3>
        <p>
          We implement appropriate technical and organizational measures to protect your personal data against unauthorized access,
          alteration, disclosure, or destruction. However, no method of transmission over the Internet is 100% secure.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">7. Your Rights (GDPR)</h3>
        <p className="mb-2">If you are in the European Economic Area, you have the right to:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to processing of your data</li>
          <li>Data portability</li>
          <li>Withdraw consent at any time</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">8. Children's Privacy</h3>
        <p>
          Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13.
          If you are a parent and believe your child has provided us with personal information, please contact us.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">9. Changes to This Policy</h3>
        <p>
          We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page
          and updating the "Last updated" date.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">10. Contact Us</h3>
        <p>
          If you have questions about this privacy policy or your personal data, please contact us at:{' '}
          <a href="mailto:mtgate.supp@gmail.com" className="text-purple-400 hover:text-purple-300 underline">mtgate.supp@gmail.com</a>
        </p>
      </section>
    </div>
  </LegalModal>
);

export const TermsOfService: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <LegalModal isOpen={isOpen} onClose={onClose} title="Terms of Service">
    <div className="space-y-6">
      <p className="text-slate-400">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h3>
        <p>
          By accessing or using MTGate ("the Service"), you agree to be bound by these Terms of Service.
          If you do not agree to these terms, please do not use our service.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">2. Description of Service</h3>
        <p>
          MTGate is a browser-based Magic: The Gathering draft simulator that allows users to participate in
          multiplayer cube drafts, build decks, and play games online. The service is provided for entertainment
          and educational purposes only.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">3. Intellectual Property</h3>
        <p>
          Magic: The Gathering, its card images, and related content are trademarks of Wizards of the Coast LLC.
          MTGate is not affiliated with, endorsed by, or sponsored by Wizards of the Coast. Card images and data
          are provided by Scryfall under fair use for educational and entertainment purposes.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">4. User Accounts</h3>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>You must provide accurate information when creating an account</li>
          <li>You are responsible for maintaining the security of your account</li>
          <li>You must not share your account credentials with others</li>
          <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">5. Acceptable Use</h3>
        <p className="mb-2">You agree not to:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Use the service for any illegal purpose</li>
          <li>Harass, abuse, or harm other users</li>
          <li>Attempt to gain unauthorized access to the service</li>
          <li>Interfere with or disrupt the service</li>
          <li>Use automated scripts or bots without permission</li>
          <li>Circumvent any access restrictions or security measures</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">6. Premium Subscription</h3>
        <p className="mb-2">Premium subscriptions provide additional features including:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Ad-free experience</li>
          <li>Priority support</li>
          <li>Additional customization options</li>
        </ul>
        <p className="mt-2">
          Subscriptions are billed in advance on a recurring basis. You may cancel at any time, and your subscription
          will remain active until the end of the billing period.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">7. Advertisements</h3>
        <p>
          Non-premium users will see advertisements served by Google AdSense. By using our service, you consent
          to the display of these advertisements. We are not responsible for the content of third-party advertisements.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">8. Disclaimer of Warranties</h3>
        <p>
          The service is provided "as is" without warranties of any kind. We do not guarantee that the service
          will be uninterrupted, error-free, or free of viruses or other harmful components.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">9. Limitation of Liability</h3>
        <p>
          To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages arising from your use of the service.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">10. Changes to Terms</h3>
        <p>
          We reserve the right to modify these terms at any time. Continued use of the service after changes
          constitutes acceptance of the new terms.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">11. Governing Law</h3>
        <p>
          These terms shall be governed by and construed in accordance with applicable laws, without regard
          to conflict of law principles.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">12. Contact</h3>
        <p>
          For questions about these Terms of Service, contact us at:{' '}
          <a href="mailto:mtgate.supp@gmail.com" className="text-purple-400 hover:text-purple-300 underline">mtgate.supp@gmail.com</a>
        </p>
      </section>
    </div>
  </LegalModal>
);

export const AboutModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <LegalModal isOpen={isOpen} onClose={onClose} title="About MTGate">
    <div className="space-y-6">
      <section className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-xl mb-4">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">MTGate</h3>
        <p className="text-purple-400">Multiplayer Magic: The Gathering Simulator</p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">What is MTGate?</h3>
        <p>
          MTGate is a free, browser-based platform for Magic: The Gathering players who want to experience
          cube drafting and casual gameplay with friends. Our mission is to make MTG drafting accessible
          to everyone, anywhere.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">Features</h3>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Real-time multiplayer drafting with up to 8 players</li>
          <li>Custom cube support - use any card list you want</li>
          <li>Integrated deck builder with mana curve analysis</li>
          <li>Live gameplay with rules engine support</li>
          <li>AI bots for solo practice</li>
          <li>Tournament bracket system</li>
          <li>Works on desktop and mobile devices</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">Disclaimer</h3>
        <p>
          MTGate is a fan-made project and is not affiliated with, endorsed by, or sponsored by
          Wizards of the Coast LLC. Magic: The Gathering and all related trademarks are property
          of Wizards of the Coast. Card images and data are sourced from Scryfall.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">Support the Project</h3>
        <p>
          MTGate is free to use with ads. Consider upgrading to Premium for an ad-free experience
          and to support ongoing development.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-2">Contact Us</h3>
        <div className="flex flex-col gap-2">
          <a href="mailto:mtgate.supp@gmail.com" className="flex items-center gap-2 text-purple-400 hover:text-purple-300">
            <Mail className="w-4 h-4" /> mtgate.supp@gmail.com
          </a>
        </div>
      </section>

      <section className="text-center text-slate-500 text-xs pt-4 border-t border-slate-700">
        <p>Version 1.0.0 (Pre-Alpha)</p>
        <p className="mt-1">Made with love for the MTG community</p>
      </section>
    </div>
  </LegalModal>
);

// Context for managing legal modals globally
interface LegalModalsContextType {
  openPrivacyPolicy: () => void;
  openTermsOfService: () => void;
  openAbout: () => void;
}

const LegalModalsContext = React.createContext<LegalModalsContextType | null>(null);

export const useLegalModals = () => {
  const context = React.useContext(LegalModalsContext);
  if (!context) {
    throw new Error('useLegalModals must be used within LegalModalsProvider');
  }
  return context;
};

export const LegalModalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const value: LegalModalsContextType = {
    openPrivacyPolicy: () => setPrivacyOpen(true),
    openTermsOfService: () => setTermsOpen(true),
    openAbout: () => setAboutOpen(true),
  };

  return (
    <LegalModalsContext.Provider value={value}>
      {children}
      <PrivacyPolicy isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfService isOpen={termsOpen} onClose={() => setTermsOpen(false)} />
      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </LegalModalsContext.Provider>
  );
};
