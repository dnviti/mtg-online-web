import React, { useState, useRef } from 'react';
import { AlertTriangle, CheckCircle, Info, X, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useFloating, useInteractions, useHover, useClick, useDismiss, offset, flip, shift, arrow, FloatingArrow } from '@floating-ui/react';
import { ValidationResult } from '../../utils/deckValidation';

interface DeckValidationDisplayProps {
    validationResult: ValidationResult;
    format: string;
}

export const DeckValidationDisplay: React.FC<DeckValidationDisplayProps> = ({
    validationResult,
    format
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const arrowRef = useRef(null);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        placement: 'bottom-end',
        middleware: [
            offset(10),
            flip(),
            shift(),
            arrow({ element: arrowRef }),
        ],
    });

    const hover = useHover(context, { delay: { open: 100, close: 300 } }); // Add delay to prevent flickering
    const click = useClick(context);
    const dismiss = useDismiss(context);

    const { getReferenceProps, getFloatingProps } = useInteractions([
        hover,
        click,
        dismiss,
    ]);

    const isValid = validationResult.isValid;

    return (
        <>
            <div
                ref={refs.setReference}
                {...getReferenceProps()}
                className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-xs uppercase cursor-pointer select-none transition-all
            ${isValid
                        ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60'
                        : 'bg-red-900/40 border-red-500/50 text-red-400 hover:bg-red-900/60 animate-pulse-slow' // Custom slow pulse class or just 'animate-pulse' if preferred
                    }
        `}
            >
                {isValid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                <span className="hidden sm:inline">{isValid ? 'Deck Valid' : 'Invalid Deck'}</span>
            </div>

            {isOpen && (
                <div
                    ref={refs.setFloating}
                    style={floatingStyles}
                    {...getFloatingProps()}
                    className="z-[999] w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-0 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                >
                    <FloatingArrow ref={arrowRef} context={context} className="fill-slate-900 border-t border-l border-slate-700" />

                    <div className={`p-3 border-b flex items-center justify-between ${isValid ? 'bg-emerald-950/50 border-emerald-900/50' : 'bg-red-950/50 border-red-900/50'}`}>
                        <h4 className={`font-bold flex items-center gap-2 ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isValid ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            {format} Status
                        </h4>
                        <div className="text-[10px] font-mono opacity-50 uppercase tracking-wider">{isValid ? 'READY' : 'ISSUES FOUND'}</div>
                    </div>

                    <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {isValid ? (
                            <div className="text-center py-4">
                                <p className="text-slate-300 text-sm mb-1">Your deck meets all requirements for <strong>{format}</strong>.</p>
                                <p className="text-slate-500 text-xs">Good luck in your games!</p>
                            </div>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {validationResult.errors.map((error, idx) => (
                                    <li key={idx} className="flex gap-3 text-xs text-slate-300 bg-red-900/10 p-2 rounded border border-red-900/30">
                                        <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {validationResult.warnings.length > 0 && (
                            <>
                                <div className="h-px bg-slate-800 my-1" />
                                <div className="flex flex-col gap-2">
                                    <h5 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">
                                        <Info className="w-3 h-3" /> Warnings
                                    </h5>
                                    <ul className="flex flex-col gap-2">
                                        {validationResult.warnings.map((warn, idx) => (
                                            <li key={idx} className="flex gap-3 text-xs text-slate-400 bg-amber-900/10 p-2 rounded border border-amber-900/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                                <span>{warn}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="bg-slate-950 p-2 text-center text-[10px] text-slate-600 border-t border-slate-800">
                        Click to dismiss
                    </div>
                </div>
            )}
        </>
    );
};
