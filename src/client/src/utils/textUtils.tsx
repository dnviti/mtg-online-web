import React from 'react';
import { ManaIcon } from '../components/ManaIcon';

/**
 * Helper to parse a text segment and replace {X} symbols with icons.
 */
const parseSymbols = (text: string): React.ReactNode => {
  if (!text) return null;
  const parts = text.split(/(\{.*?\})/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('{') && part.endsWith('}')) {
          let content = part.slice(1, -1).toLowerCase();
          content = content.replace('/', '');

          // Manual mapping for special symbols
          const symbolMap: Record<string, string> = {
            't': 'tap',
            'q': 'untap',
          };

          if (symbolMap[content]) {
            content = symbolMap[content];
          }

          return (
            <ManaIcon
              key={index}
              symbol={content}
              className="text-[0.9em] text-slate-900 mx-[1px] align-baseline inline-block"
              shadow
            />
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

/**
 * Parses a string containing Magic: The Gathering symbols and lists.
 * Replaces symbols with ManaIcon components and bulleted lists with HTML structure.
 */
export const formatOracleText = (text: string | null | undefined): React.ReactNode => {
  if (!text) return null;

  // Split by specific bullet character or newlines first
  // Some cards use actual newlines for abilities, some use bullets for modes.
  // We want to handle "•" as a list item start.

  // Strategy:
  // 1. Split by newline to respect existing paragraph breaks.
  // 2. Inside each paragraph, check for bullets.

  const lines = text.split('\n');

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) return null;

        // Check for bullets
        if (line.includes('•')) {
          const segments = line.split('•');

          return (
            <div key={lineIdx} className="flex flex-col gap-0.5">
              {segments.map((seg, segIdx) => {
                const content = seg.trim();
                if (!content) return null;

                // If it's the very first segment and the line didn't start with bullet, it's intro text.
                // If the line started with "•", segments[0] is empty (handled above).
                const isListItem = segIdx > 0 || line.trim().startsWith('•');

                return (
                  <div key={segIdx} className={`flex gap-1 ${isListItem ? 'ml-2 pl-2 border-l-2 border-white/10' : ''}`}>
                    {isListItem && <span className="text-emerald-400 font-bold">•</span>}
                    <span className={isListItem ? "text-slate-200" : ""}>{parseSymbols(content)}</span>
                  </div>
                );
              })}
            </div>
          );
        }

        return <div key={lineIdx}>{parseSymbols(line)}</div>;
      })}
    </div>
  );
};
