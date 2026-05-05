import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { audit } from "../services/audit.js";
import {
  detectYearFromFilename,
  parseExcel,
} from "../services/parser/parser.js";

export const filesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

const UploadQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

filesRouter.get("/", async (_req, res) => {
  const files = await prisma.excelFile.findMany({
    orderBy: [{ year: "desc" }, { uploadedAt: "desc" }],
    select: {
      id: true,
      year: true,
      originalName: true,
      sha256: true,
      sizeBytes: true,
      uploadedAt: true,
      status: true,
      notes: true,
    },
  });
  res.json(files);
});

filesRouter.get("/:id/audit", async (req, res) => {
  const file = await prisma.excelFile.findUnique({
    where: { id: req.params.id! },
    include: {
      yearData: {
        include: { program: true },
      },
    },
  });
  if (!file) {
    res.status(404).json({ error: "Archivo no encontrado" });
    return;
  }
  res.json({
    id: file.id,
    year: file.year,
    originalName: file.originalName,
    uploadedAt: file.uploadedAt,
    status: file.status,
    parserAudit: JSON.parse(file.parserAuditJson),
    extractions: file.yearData.map((d) => ({
      programSlug: d.programSlug,
      programName: d.program.name,
      family: d.program.family,
      segment: d.segment,
      creditoOriginal: d.creditoOriginal,
      creditoDefinitivo: d.creditoDefinitivo,
      gastadoAcumulado: d.gastadoAcumulado,
      saldos: d.saldos,
      months: [
        d.m01, d.m02, d.m03, d.m04, d.m05, d.m06,
        d.m07, d.m08, d.m09, d.m10, d.m11, d.m12,
      ],
      source: JSON.parse(d.sourceJson),
    })),
  });
});

filesRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Falta archivo" });
    return;
  }
  const file = req.file;
  const parsedQuery = UploadQuery.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Query inválido" });
    return;
  }

  const buf = file.buffer;
  const sha = crypto.createHash("sha256").update(buf).digest("hex");

  // Si ya existe ese hash, devolver el existente (idempotencia)
  const existing = await prisma.excelFile.findUnique({ where: { sha256: sha } });
  if (existing) {
    res.status(200).json({ ...existing, deduped: true });
    return;
  }

  const yearFromName = detectYearFromFilename(file.originalname);
  const year = parsedQuery.data.year ?? yearFromName ?? null;
  if (year == null) {
    res.status(400).json({
      error:
        "No se pudo detectar el año del archivo. Renombrá el archivo para incluir el año (ej: RECURSOS Y EROGACIONES 2026.xls) o pasalo como ?year=2026.",
    });
    return;
  }

  let parseResult;
  try {
    parseResult = parseExcel(buf, { year, filename: file.originalname });
  } catch (err) {
    res.status(400).json({ error: `Error parseando: ${(err as Error).message}` });
    return;
  }

  const yearDir = path.join(config.excelsDir, String(year));
  await fs.mkdir(yearDir, { recursive: true });
  const safeName = file.originalname.replace(/[^A-Za-z0-9._\- ]/g, "_");
  const storedPath = path.join(yearDir, `${sha.slice(0, 12)}__${safeName}`);
  await fs.writeFile(storedPath, buf);

  const hasErrors = parseResult.warnings.some((w) => w.level === "error");
  const hasWarn = parseResult.warnings.some((w) => w.level === "warning");
  const status = hasErrors ? "ERROR" : hasWarn ? "WARNING" : "OK";

  const txResult = await prisma.$transaction(async (tx) => {
    const previous = await tx.excelFile.findMany({
      where: { year },
      select: { id: true, originalName: true, storedPath: true, uploadedAt: true },
    });
    for (const old of previous) {
      await tx.excelFile.delete({ where: { id: old.id } });
    }
    const created = await tx.excelFile.create({
      data: {
        year,
        originalName: file.originalname,
        storedPath,
        sha256: sha,
        sizeBytes: file.size,
        status,
        parserAuditJson: JSON.stringify({
          warnings: parseResult.warnings,
          unmappedSheets: parseResult.unmappedSheets,
          programs: parseResult.programs.map((p) => ({
            programSlug: p.programSlug,
            matchedSheet: p.matchedSheet,
            warnings: p.warnings,
            blocks: p.blocks.map((b) => ({
              segment: b.segment,
              source: b.source,
            })),
          })),
        }),
        yearData: {
          create: parseResult.programs.flatMap((p) =>
            p.blocks.map((b) => ({
              programSlug: p.programSlug,
              segment: b.segment,
              creditoOriginal: b.creditoOriginal,
              creditoDefinitivo: b.creditoDefinitivo,
              gastadoAcumulado: b.gastadoAcumulado,
              saldos: b.saldos,
              m01: b.months[0] ?? 0,
              m02: b.months[1] ?? 0,
              m03: b.months[2] ?? 0,
              m04: b.months[3] ?? 0,
              m05: b.months[4] ?? 0,
              m06: b.months[5] ?? 0,
              m07: b.months[6] ?? 0,
              m08: b.months[7] ?? 0,
              m09: b.months[8] ?? 0,
              m10: b.months[9] ?? 0,
              m11: b.months[10] ?? 0,
              m12: b.months[11] ?? 0,
              sourceJson: JSON.stringify(b.source),
              obras: {
                create: b.obras.map((o) => ({
                  rowIdx: o.rowIdx,
                  expediente: o.expediente,
                  montoAdjudicacion: o.montoAdjudicacion,
                  pry: o.pry,
                  cuov: o.cuov,
                  concepto: o.concepto,
                  creditoOriginal: o.creditoOriginal,
                  creditoDefinitivo: o.creditoDefinitivo,
                  gastadoAcumulado: o.gastadoAcumulado,
                  saldos: o.saldos,
                  m01: o.months[0] ?? 0,
                  m02: o.months[1] ?? 0,
                  m03: o.months[2] ?? 0,
                  m04: o.months[3] ?? 0,
                  m05: o.months[4] ?? 0,
                  m06: o.months[5] ?? 0,
                  m07: o.months[6] ?? 0,
                  m08: o.months[7] ?? 0,
                  m09: o.months[8] ?? 0,
                  m10: o.months[9] ?? 0,
                  m11: o.months[10] ?? 0,
                  m12: o.months[11] ?? 0,
                })),
              },
            })),
          ),
        },
      },
    });
    return { created, previous };
  });

  const { created, previous } = txResult;

  for (const old of previous) {
    try {
      await fs.unlink(old.storedPath);
    } catch {
      // ignorable
    }
  }

  if (previous.length > 0) {
    const oldNames = previous.map((p) => p.originalName).join(", ");
    await audit(
      "REPLACE_FILE",
      `Reemplazó ${oldNames} con ${file.originalname} (${year}) [${status}]`,
    );
  } else {
    await audit(
      "UPLOAD_FILE",
      `Subió ${file.originalname} (${year}) [${status}]`,
    );
  }

  res.status(201).json({
    id: created.id,
    year: created.year,
    status: created.status,
    warnings: parseResult.warnings,
    programsExtracted: parseResult.programs.length,
    replaced:
      previous.length > 0
        ? previous.map((p) => ({
            originalName: p.originalName,
            uploadedAt: p.uploadedAt,
          }))
        : undefined,
  });
});

filesRouter.delete("/:id", async (req, res) => {
  const file = await prisma.excelFile.findUnique({
    where: { id: req.params.id! },
  });
  if (!file) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await prisma.excelFile.delete({ where: { id: file.id } });
  try {
    await fs.unlink(file.storedPath);
  } catch {
    // ignorable
  }
  await audit("DELETE_FILE", `Eliminó ${file.originalName} (${file.year})`);
  res.json({ ok: true });
});
