/** Whiteboard colours for the Quiet Studio look: a charcoal page with warm-white ink and muted accents. Owner: Lane A. */

/** The page. Always this colour, so a stored stroke looks the same to everybody. */
export const BOARD_BG = '#151714';
/** Faint dots every 50 board units, like the dotted grid on the entry page. */
export const BOARD_DOT = 'rgba(192, 205, 157, 0.13)';
export const BOARD_FONT = "'Geist Variable', 'Segoe UI', system-ui, sans-serif";

export const BOARD_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#eeefe7', name: 'Cream' },
  { hex: '#c0cd9d', name: 'Sage' },
  { hex: '#8db4d8', name: 'Sky' },
  { hex: '#e69c90', name: 'Rose' },
  { hex: '#d8ba83', name: 'Amber' },
  { hex: '#b7a6d8', name: 'Lilac' },
];
export const DEFAULT_INK = BOARD_COLORS[0].hex;

/** Shapes drawn on a light board use near-black ink, which would vanish on this page: show it as cream. */
const LEGACY_INK = '#151515';
export const onPage = (color: string): string => (color.toLowerCase() === LEGACY_INK ? DEFAULT_INK : color);
