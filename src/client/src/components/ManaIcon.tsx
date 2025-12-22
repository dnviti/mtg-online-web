import React from 'react';

type ManaSymbol =
  | 'w' // White
  | 'u' // Blue
  | 'b' // Black
  | 'r' // Red
  | 'g' // Green
  | 'c' // Colorless
  | 'x' | 'y' | 'z' // Variables
  | 't' | 'tap' // Tap
  | 'q' | 'untap' // Untap
  | 'e' | 'energy' // Energy
  | 'p' // Phyrexian generic? (check font)
  | 'vp' // Velcro/Planechase?
  | 's' // Snow
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' // Numbers
  | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' // Higher numbers usually specialized, check support
  | 'infinity'
  | string; // Allow others

interface ManaIconProps {
  symbol: ManaSymbol;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2x' | '3x' | '4x' | '5x'; // 'ms-2x' etc from the font or custom sizing
  className?: string;
  shadow?: boolean; // 'ms-cost' adds a shadow usually
  fixedWidth?: boolean; // 'ms-fw'
}

export const ManaIcon: React.FC<ManaIconProps> = ({
  symbol,
  size,
  className = '',
  shadow = false,
  fixedWidth = false,
}) => {
  // Normalize symbol to lowercase
  const sym = symbol.toLowerCase();

  // Construct class names
  // ms is the base class
  const classes = [
    'ms',
    `ms-${sym}`,
    size ? `ms-${size}` : '',
    shadow ? 'ms-cost' : '', // 'ms-cost' is often used formana costs to give them a circle/shadow look.
    fixedWidth ? 'ms-fw' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <i className={classes} title={`Mana symbol: ${symbol}`} aria-hidden="true" />;
};
