import React, { useEffect, useState, useRef } from 'react';
import { Copy, Scissors, Clipboard } from 'lucide-react';

interface MenuPosition {
  x: number;
  y: number;
}

export const GlobalContextMenu: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [targetElement, setTargetElement] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if target is an input or textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const inputTarget = target as HTMLInputElement | HTMLTextAreaElement;

        // Only allow text-based inputs (ignore range, checkbox, etc.)
        if (target.tagName === 'INPUT') {
          const type = (target as HTMLInputElement).type;
          if (!['text', 'password', 'email', 'number', 'search', 'tel', 'url'].includes(type)) {
            e.preventDefault();
            setVisible(false);
            return;
          }
        }

        e.preventDefault();
        setTargetElement(inputTarget);

        // Position menu within viewport
        const menuWidth = 150;
        const menuHeight = 120; // approx
        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

        setPosition({ x, y });
        setVisible(true);
      } else {
        // Disable context menu for everything else
        e.preventDefault();
        setVisible(false);
      }
    };

    const handleClick = (e: MouseEvent) => {
      // Close menu on any click outside
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };

    // Use capture to ensure we intercept early
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    document.addEventListener('scroll', () => setVisible(false)); // Close on scroll

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  if (!visible) return null;

  const handleCopy = async () => {
    if (!targetElement) return;
    const text = targetElement.value.substring(targetElement.selectionStart || 0, targetElement.selectionEnd || 0);
    if (text) {
      await navigator.clipboard.writeText(text);
    }
    setVisible(false);
    targetElement.focus();
  };

  const handleCut = async () => {
    if (!targetElement) return;
    const start = targetElement.selectionStart || 0;
    const end = targetElement.selectionEnd || 0;
    const text = targetElement.value.substring(start, end);

    if (text) {
      await navigator.clipboard.writeText(text);

      // Update value
      const newVal = targetElement.value.slice(0, start) + targetElement.value.slice(end);

      // React state update hack: Trigger native value setter and event
      // This ensures React controlled components update their state
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(targetElement, newVal);
      } else {
        targetElement.value = newVal;
      }

      const event = new Event('input', { bubbles: true });
      targetElement.dispatchEvent(event);
    }
    setVisible(false);
    targetElement.focus();
  };

  const handlePaste = async () => {
    if (!targetElement) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const start = targetElement.selectionStart || 0;
      const end = targetElement.selectionEnd || 0;

      const currentVal = targetElement.value;
      const newVal = currentVal.slice(0, start) + text + currentVal.slice(end);

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(targetElement, newVal);
      } else {
        targetElement.value = newVal;
      }

      const event = new Event('input', { bubbles: true });
      targetElement.dispatchEvent(event);

      // Move cursor
      // Timeout needed for React to process input event first
      setTimeout(() => {
        targetElement.setSelectionRange(start + text.length, start + text.length);
      }, 0);

    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
    setVisible(false);
    targetElement.focus();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[10000] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 w-36 overflow-hidden animate-in fade-in zoom-in duration-75"
      style={{ top: position.y, left: position.x }}
    >
      <button
        onClick={handleCut}
        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2 transition-colors disabled:opacity-50"
        disabled={!targetElement?.value || targetElement?.selectionStart === targetElement?.selectionEnd}
      >
        <Scissors className="w-4 h-4" /> Cut
      </button>
      <button
        onClick={handleCopy}
        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2 transition-colors disabled:opacity-50"
        disabled={!targetElement?.value || targetElement?.selectionStart === targetElement?.selectionEnd}
      >
        <Copy className="w-4 h-4" /> Copy
      </button>
      <button
        onClick={handlePaste}
        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2 transition-colors border-t border-slate-700 mt-1 pt-2"
      >
        <Clipboard className="w-4 h-4" /> Paste
      </button>
    </div>
  );
};
