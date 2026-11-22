// DR. VOSS'S RESEARCH, as the brain sees it: a registry the Backrooms service
// fills at boot (index.ts), so the brain never imports the game. The hints
// themselves — and how vague they are — are decided in
// src/backrooms/hints.ts; this only carries them. Read ONLY into a trusted
// surveyor's own DM with Voss (brain.ts memoryBlock).

let source: ((userId: number) => string[]) | null = null;

export function setResearchSource(fn: ((userId: number) => string[]) | null): void {
  source = fn;
}

export function researchFor(userId: number): string[] {
  try {
    return source ? source(userId) : [];
  } catch {
    return [];
  }
}
