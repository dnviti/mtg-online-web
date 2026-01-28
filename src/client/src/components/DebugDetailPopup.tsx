import React from 'react';
import {
  Code2,
  ArrowRight,
  Zap,
  Target,
  Layers,
  CheckCircle2,
  AlertCircle,
  Info,
  BookOpen,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { DebugDetailedExplanation, DebugExplanationStep, DebugStepType } from '../types/game';

interface DebugDetailPopupProps {
  explanation: DebugDetailedExplanation;
  position?: { x: number; y: number };
  onClose?: () => void;
}

const stepTypeIcons: Record<DebugStepType, React.ReactNode> = {
  parse: <Code2 className="w-3.5 h-3.5" />,
  cost: <Sparkles className="w-3.5 h-3.5" />,
  target: <Target className="w-3.5 h-3.5" />,
  stack: <Layers className="w-3.5 h-3.5" />,
  resolve: <CheckCircle2 className="w-3.5 h-3.5" />,
  effect: <Zap className="w-3.5 h-3.5" />,
  trigger: <Sparkles className="w-3.5 h-3.5" />,
  state: <AlertCircle className="w-3.5 h-3.5" />,
  zone: <ArrowRight className="w-3.5 h-3.5" />,
  phase: <ChevronRight className="w-3.5 h-3.5" />,
  info: <Info className="w-3.5 h-3.5" />,
};

const stepTypeColors: Record<DebugStepType, string> = {
  parse: 'text-violet-400 bg-violet-500/20 border-violet-500/30',
  cost: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
  target: 'text-red-400 bg-red-500/20 border-red-500/30',
  stack: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
  resolve: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
  effect: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
  trigger: 'text-pink-400 bg-pink-500/20 border-pink-500/30',
  state: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
  zone: 'text-teal-400 bg-teal-500/20 border-teal-500/30',
  phase: 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30',
  info: 'text-slate-400 bg-slate-500/20 border-slate-500/30',
};

const highlightColors: Record<string, string> = {
  info: 'border-l-blue-500 bg-blue-500/5',
  warning: 'border-l-amber-500 bg-amber-500/5',
  success: 'border-l-emerald-500 bg-emerald-500/5',
  error: 'border-l-red-500 bg-red-500/5',
};

const StepItem: React.FC<{ step: DebugExplanationStep; index: number }> = ({ step, index }) => {
  const typeColor = stepTypeColors[step.type] || stepTypeColors.info;
  const highlightClass = step.highlight ? highlightColors[step.highlight] : '';

  return (
    <div className={`relative pl-6 pb-4 ${index > 0 ? 'pt-0' : ''}`}>
      {/* Timeline line */}
      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-slate-700" />

      {/* Step dot */}
      <div className={`absolute left-0 top-0.5 w-6 h-6 rounded-full border flex items-center justify-center ${typeColor}`}>
        {stepTypeIcons[step.type]}
      </div>

      {/* Content */}
      <div className={`ml-2 p-2 rounded-lg border border-slate-700/50 ${highlightClass} ${step.highlight ? 'border-l-2' : ''}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeColor}`}>
            {step.type}
          </span>
          <span className="text-sm font-medium text-white">{step.title}</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>

        {step.details && step.details.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {step.details.map((detail, i) => (
              <li key={i} className="text-[11px] text-slate-400 leading-relaxed">
                {detail}
              </li>
            ))}
          </ul>
        )}

        {step.codeSnippet && (
          <div className="mt-2 p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] text-slate-300 whitespace-pre-wrap">
            {step.codeSnippet}
          </div>
        )}
      </div>
    </div>
  );
};

export const DebugDetailPopup: React.FC<DebugDetailPopupProps> = ({
  explanation,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Engine Processing Details</h3>
        </div>
        <p className="text-xs text-slate-400 mt-1">{explanation.summary}</p>
      </div>

      {/* Scrollable content */}
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
        {/* Oracle Text Section */}
        {explanation.oracleText && (
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-semibold text-slate-300">Oracle Text</span>
            </div>
            <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
              {explanation.oracleText}
            </div>
          </div>
        )}

        {/* Parsed Abilities Section */}
        {explanation.parsedAbilities && explanation.parsedAbilities.length > 0 && (
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-slate-300">
                Parsed Abilities ({explanation.parsedAbilities.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {explanation.parsedAbilities.map((ability, i) => (
                <div key={i} className="flex items-start gap-2 p-1.5 bg-slate-800/50 rounded text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    ability.type === 'static' ? 'bg-slate-600 text-slate-200' :
                    ability.type === 'triggered' || ability.type === 'etb' || ability.type === 'ltb' || ability.type === 'dies' || ability.type === 'attack' ? 'bg-pink-500/30 text-pink-300' :
                    ability.type === 'activated' ? 'bg-amber-500/30 text-amber-300' :
                    'bg-cyan-500/30 text-cyan-300'
                  }`}>
                    {ability.type}
                  </span>
                  <span className="text-slate-300 flex-1">{ability.effect}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Steps Timeline */}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-slate-300">
              Processing Steps ({explanation.steps.length})
            </span>
          </div>
          <div className="relative">
            {explanation.steps.map((step, index) => (
              <StepItem key={step.id} step={step} index={index} />
            ))}
          </div>
        </div>

        {/* State Changes */}
        {explanation.stateChanges.length > 0 && (
          <div className="p-3 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs font-semibold text-slate-300">
                State Changes ({explanation.stateChanges.length})
              </span>
            </div>
            <div className="space-y-1">
              {explanation.stateChanges.map((change, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 bg-slate-800/30 rounded">
                  <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[9px] font-bold uppercase">
                    {change.type}
                  </span>
                  <span className="text-slate-300 flex-1">{change.description}</span>
                  {change.before && change.after && (
                    <span className="text-slate-500">
                      <span className="text-red-400">{change.before}</span>
                      {' → '}
                      <span className="text-emerald-400">{change.after}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Triggered Abilities */}
        {explanation.triggeredAbilities && explanation.triggeredAbilities.length > 0 && (
          <div className="p-3 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-xs font-semibold text-slate-300">
                Triggered Abilities ({explanation.triggeredAbilities.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {explanation.triggeredAbilities.map((trigger, i) => (
                <div key={i} className="p-2 bg-pink-500/10 border border-pink-500/20 rounded text-[11px]">
                  <div className="font-medium text-pink-300">{trigger.sourceCardName}</div>
                  <div className="text-slate-400 mt-0.5">{trigger.triggerCondition}</div>
                  <div className="text-slate-300 mt-1">{trigger.effect}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rules References */}
        {explanation.rulesReferences && explanation.rulesReferences.length > 0 && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-500">Rules References</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {explanation.rulesReferences.map((ref, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-400 border border-slate-700"
                  title={ref.description}
                >
                  {ref.rule}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugDetailPopup;
