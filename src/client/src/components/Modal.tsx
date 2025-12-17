import React from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
  type?: 'info' | 'success' | 'warning' | 'error';
  confirmLabel?: string;
  onConfirm?: () => void;
  cancelLabel?: string;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  children,
  type = 'info',
  confirmLabel = 'OK',
  onConfirm,
  cancelLabel,
  maxWidth = 'max-w-md'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle className="w-6 h-6 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case 'error': return <AlertTriangle className="w-6 h-6 text-red-500" />;
      default: return <Info className="w-6 h-6 text-blue-500" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'success': return 'border-emerald-500/50';
      case 'warning': return 'border-amber-500/50';
      case 'error': return 'border-red-500/50';
      default: return 'border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`bg-slate-900 border ${getBorderColor()} rounded-xl shadow-2xl ${maxWidth} w-full p-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}
        role="dialog"
      >
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h3 className="text-xl font-bold text-white">{title}</h3>
          </div>
          {onClose && !cancelLabel && (
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {message && (
            <p className="text-slate-300 mb-4 leading-relaxed">
              {message}
            </p>
          )}
          {children}
        </div>

        {(onConfirm || cancelLabel) && (
          <div className="flex justify-end gap-3 mt-6 shrink-0">
            {cancelLabel && onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors border border-slate-700"
              >
                {cancelLabel}
              </button>
            )}
            {onConfirm && (
              <button
                onClick={() => {
                  onConfirm();
                  if (onClose) onClose();
                }}
                className={`px-6 py-2 rounded-lg font-bold text-white shadow-lg transition-transform hover:scale-105 ${type === 'error' ? 'bg-red-600 hover:bg-red-500' :
                  type === 'warning' ? 'bg-amber-600 hover:bg-amber-500' :
                    type === 'success' ? 'bg-emerald-600 hover:bg-emerald-500' :
                      'bg-blue-600 hover:bg-blue-500'
                  }`}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
