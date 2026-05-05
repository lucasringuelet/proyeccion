import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseExcel, detectYearFromFilename } from "./parser.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const FILE_2025 = path.join(
  REPO_ROOT,
  "RECURSOS Y EROGACIONES 2025 (1).xls",
);
const FILE_2026 = path.join(
  REPO_ROOT,
  "RECURSOS Y EROGACIONES 2026 (2).xls",
);

describe("detectYearFromFilename", () => {
  it("extrae el año correctamente", () => {
    expect(detectYearFromFilename("RECURSOS Y EROGACIONES 2026 (2).xls")).toBe(2026);
    expect(detectYearFromFilename("Recursos 2024.xls")).toBe(2024);
    expect(detectYearFromFilename("sin_anio.xls")).toBeNull();
  });
});

describe("parseExcel — archivo 2025", () => {
  if (!fs.existsSync(FILE_2025)) {
    it.skip("archivo de muestra no presente", () => {});
    return;
  }
  const buf = fs.readFileSync(FILE_2025);
  const result = parseExcel(buf, { filename: "RECURSOS Y EROGACIONES 2025 (1).xls" });

  it("detecta año 2025", () => {
    expect(result.year).toBe(2025);
  });

  it("encuentra los 6 programas esperados", () => {
    const slugs = result.programs.map((p) => p.programSlug).sort();
    expect(slugs).toEqual([
      "bid_4416",
      "bid_5418",
      "caf_11",
      "fonplata",
      "obras_ff11",
      "obras_ff12",
    ]);
  });

  it("Familia 1 tiene un solo bloque SOLE", () => {
    const ff11 = result.programs.find((p) => p.programSlug === "obras_ff11")!;
    expect(ff11.blocks).toHaveLength(1);
    expect(ff11.blocks[0]!.segment).toBe("SOLE");
    expect(ff11.blocks[0]!.creditoDefinitivo).toBeGreaterThan(0);
  });

  it("BID 4416 tiene Renta + Préstamo + Total y Renta+Préstamo ≈ Total", () => {
    const bid = result.programs.find((p) => p.programSlug === "bid_4416")!;
    const total = bid.blocks.find((b) => b.segment === "TOTAL")!;
    const renta = bid.blocks.find((b) => b.segment === "RENTA")!;
    const prestamo = bid.blocks.find((b) => b.segment === "PRESTAMO")!;
    expect(total).toBeDefined();
    expect(renta).toBeDefined();
    expect(prestamo).toBeDefined();
    const sum = renta.creditoDefinitivo + prestamo.creditoDefinitivo;
    expect(Math.abs(sum - total.creditoDefinitivo)).toBeLessThan(100);
  });

  it("Cada bloque tiene 12 meses con valores numéricos", () => {
    for (const p of result.programs) {
      for (const b of p.blocks) {
        expect(b.months).toHaveLength(12);
        b.months.forEach((m) => expect(typeof m).toBe("number"));
      }
    }
  });
});

describe("parseExcel — archivo 2026", () => {
  if (!fs.existsSync(FILE_2026)) {
    it.skip("archivo de muestra no presente", () => {});
    return;
  }
  const buf = fs.readFileSync(FILE_2026);
  const result = parseExcel(buf, { filename: "RECURSOS Y EROGACIONES 2026 (2).xls" });

  it("detecta año 2026", () => {
    expect(result.year).toBe(2026);
  });

  it("solo enero-abril tienen valores en obras_ff11 (cierre actual: abril 2026)", () => {
    const p = result.programs.find((p) => p.programSlug === "obras_ff11")!;
    const block = p.blocks[0]!;
    expect(block.months[0]).toBeGreaterThan(0); // ENE
    expect(block.months[1]).toBeGreaterThan(0); // FEB
    expect(block.months[2]).toBeGreaterThan(0); // MAR
    expect(block.months[3]).toBeGreaterThan(0); // ABR
    expect(block.months[4]).toBe(0); // MAY (futuro)
    expect(block.months[11]).toBe(0); // DIC (futuro)
  });

  it("FONPLATA tiene desglose Renta + Préstamo", () => {
    const p = result.programs.find((p) => p.programSlug === "fonplata")!;
    expect(p.blocks.find((b) => b.segment === "RENTA")).toBeDefined();
    expect(p.blocks.find((b) => b.segment === "PRESTAMO")).toBeDefined();
  });

  it("CAF 11 tiene desglose Renta + Préstamo (incluso con label F.F. 1.1 mal escrito)", () => {
    const p = result.programs.find((p) => p.programSlug === "caf_11")!;
    expect(p.blocks.find((b) => b.segment === "RENTA")).toBeDefined();
    expect(p.blocks.find((b) => b.segment === "PRESTAMO")).toBeDefined();
  });

  it("BID 5418 tiene desglose Renta + Préstamo (label F.F. 1.1 - BID 80% es typo)", () => {
    const p = result.programs.find((p) => p.programSlug === "bid_5418")!;
    expect(p.blocks.find((b) => b.segment === "RENTA")).toBeDefined();
    expect(p.blocks.find((b) => b.segment === "PRESTAMO")).toBeDefined();
  });
});
