import React, { useState } from 'react';
import { Crown, CreditCard, Check, Settings, AlertCircle } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../components/Toast';

export const PremiumUpgrade: React.FC = () => {
  const { user, isPremium, subscribe, openBillingPortal } = useUser();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

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

  // Already premium - show status
  if (isPremium) {
    const premiumSince = user?.premiumSince ? new Date(user.premiumSince).toLocaleDateString('it-IT') : '';
    const premiumUntil = user?.premiumUntil ? new Date(user.premiumUntil).toLocaleDateString('it-IT') : '';
    const isCanceled = user?.subscriptionStatus === 'canceled';
    const isPastDue = user?.subscriptionStatus === 'past_due';

    return (
      <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Crown className="w-6 h-6 text-amber-400" />
            <h3 className="text-xl font-bold text-amber-400">Premium Member</h3>
          </div>
          <button
            onClick={handleManageSubscription}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <Settings className="w-4 h-4" />
            Gestisci
          </button>
        </div>

        {isPastDue && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
            <AlertCircle className="w-4 h-4" />
            Pagamento fallito. Aggiorna il metodo di pagamento.
          </div>
        )}

        {isCanceled && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-300 text-sm">
            <AlertCircle className="w-4 h-4" />
            Abbonamento cancellato. Attivo fino al {premiumUntil}.
          </div>
        )}

        <div className="text-slate-300 space-y-1">
          <p>
            Piano: <span className="text-white font-medium">
              {user?.subscriptionPlan === 'yearly' ? 'Annuale' : 'Mensile'}
            </span>
          </p>
          {premiumSince && <p className="text-sm text-slate-400">Membro dal {premiumSince}</p>}
          {premiumUntil && !isCanceled && (
            <p className="text-sm text-slate-400">Prossimo rinnovo: {premiumUntil}</p>
          )}
        </div>
      </div>
    );
  }

  // Not premium - show upgrade options
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
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
  );
};
