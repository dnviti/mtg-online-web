import React, { useState } from 'react';
import { Crown, CreditCard, Check, Settings, X } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../components/Toast';

export const PremiumUpgrade: React.FC = () => {
  const { user, isPremium, subscribe, openBillingPortal } = useUser();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [showModal, setShowModal] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await subscribe(selectedPlan);
    } catch (e: any) {
      showToast(e.message || 'Errore durante la sottoscrizione', 'error');
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      await openBillingPortal();
    } catch (e: any) {
      showToast(e.message || 'Errore apertura portale', 'error');
      setLoading(false);
    }
  };

  // Already premium - show compact status
  if (isPremium) {
    const premiumUntil = user?.premiumUntil ? new Date(user.premiumUntil).toLocaleDateString('it-IT') : '';
    const isCanceled = user?.subscriptionStatus === 'canceled';
    const isPastDue = user?.subscriptionStatus === 'past_due';

    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-400">Premium</span>
          {isPastDue && (
            <span className="text-xs text-red-400">(Pagamento fallito)</span>
          )}
          {isCanceled && (
            <span className="text-xs text-orange-400">(fino al {premiumUntil})</span>
          )}
        </div>
        <button
          onClick={handleManageSubscription}
          disabled={loading}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
        >
          <Settings className="w-3.5 h-3.5" />
          Gestisci
        </button>
      </div>
    );
  }

  // Not premium - show small button that opens modal
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/50 rounded-lg transition-all"
      >
        <Crown className="w-4 h-4" />
        <span>Passa a Premium</span>
      </button>

      {/* Premium Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md mx-4 relative">
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <Crown className="w-6 h-6 text-amber-400" />
              <h3 className="text-xl font-bold text-white">Passa a Premium</h3>
            </div>

            <p className="text-slate-400 mb-6">
              Rimuovi tutte le pubblicità e goditi un'esperienza più pulita.
            </p>

            {/* Plan selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Monthly plan */}
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedPlan === 'monthly'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="text-lg font-bold text-white">$2.99</div>
                <div className="text-sm text-slate-400">al mese</div>
              </button>

              {/* Yearly plan */}
              <button
                onClick={() => setSelectedPlan('yearly')}
                className={`p-4 rounded-lg border-2 transition-all text-left relative ${
                  selectedPlan === 'yearly'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full">
                  -30%
                </div>
                <div className="text-lg font-bold text-white">$24.99</div>
                <div className="text-sm text-slate-400">all'anno</div>
              </button>
            </div>

            {/* Benefits */}
            <ul className="space-y-2 mb-6">
              <li className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                Nessuna pubblicità laterale
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                Layout espanso su tutti gli schermi
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                Cancella quando vuoi
              </li>
            </ul>

            {/* Subscribe button */}
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <CreditCard className="w-5 h-5" />
              {loading ? 'Caricamento...' : `Abbonati - ${selectedPlan === 'yearly' ? '$24.99/anno' : '$2.99/mese'}`}
            </button>

            <p className="text-xs text-slate-500 text-center mt-3">
              Pagamento sicuro tramite Stripe. Puoi cancellare in qualsiasi momento.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
