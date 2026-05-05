import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { authRouter } from "./routes/auth.js";
import { programsRouter } from "./routes/programs.js";
import { filesRouter } from "./routes/files.js";
import { settingsRouter } from "./routes/settings.js";
import { projectionRouter } from "./routes/projection.js";
import { programDetailRouter } from "./routes/programDetail.js";
import { obrasRouter } from "./routes/obras.js";

const app = express();

app.use(express.json({ limit: "2mb" }));

if (!config.isProduction) {
  app.use(
    cors({
      origin: config.devFrontendOrigin,
      credentials: true,
    }),
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: "0.1.0" });
});

app.use("/api/auth", authRouter);

// Todo el resto requiere sesión autenticada
app.use("/api", requireAuth);
app.use("/api/programs", programsRouter);
app.use("/api/files", filesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/projection", projectionRouter);
app.use("/api/program-detail", programDetailRouter);
app.use("/api/obras", obrasRouter);

// En producción servimos el build de React
if (config.isProduction) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(here, "../../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[backend] web/dist no existe en ${webDist}`);
  }
}

app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[backend] escuchando en http://localhost:${config.port}  (NODE_ENV=${
      process.env.NODE_ENV ?? "development"
    })`,
  );
});
