// Spray-can colors — ONE table shared by the world renderer (the marks on
// the wall) and the locker UI (the swatch you pick). Paint is free now
// (Josh's round-3 call), so this is purely a look-up, not a price list.

export const SPRAY_HEX: Record<string, number> = {
  black: 0x141210,
  red: 0xc62214,
  green: 0x1f9b3a,
  blue: 0x1f5dc6,
  orange: 0xe07514,
};

export const sprayCss = (color: string | null | undefined): string =>
  `#${(SPRAY_HEX[color ?? "black"] ?? SPRAY_HEX.black).toString(16).padStart(6, "0")}`;
