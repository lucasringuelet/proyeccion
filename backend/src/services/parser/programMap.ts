import type { ProgramDef } from "./types.js";

// Definición canónica de los 6 programas que la app procesa.
// Debe coincidir con `prisma/seed.ts`.
export const PROGRAMS: ProgramDef[] = [
  {
    slug: "obras_ff11",
    name: "Obras FF 11",
    family: "FAMILIA1",
    sheetAliases: ["^Obras\\s+\\d{4}\\s+FF\\s*11\\b"],
  },
  {
    slug: "obras_ff12",
    name: "Obras FF 12",
    family: "FAMILIA1",
    sheetAliases: ["^Obras\\s+\\d{4}\\s+FF\\s*12\\b"],
  },
  {
    slug: "bid_4416",
    name: "BID 4416",
    family: "FAMILIA2",
    sheetAliases: ["^BID\\s*4416\\b"],
  },
  {
    slug: "bid_5418",
    name: "BID 5418",
    family: "FAMILIA2",
    sheetAliases: ["^BID\\s*5418\\b"],
  },
  {
    slug: "caf_11",
    name: "CAF 11",
    family: "FAMILIA2",
    sheetAliases: ["^CAF\\b"],
  },
  {
    slug: "fonplata",
    name: "FONPLATA",
    family: "FAMILIA2",
    sheetAliases: ["^FONPLATA\\b"],
  },
];

export function findProgramBySheetName(
  sheetName: string,
): ProgramDef | undefined {
  const trimmed = sheetName.trim();
  return PROGRAMS.find((p) =>
    p.sheetAliases.some((rx) => new RegExp(rx, "i").test(trimmed)),
  );
}
