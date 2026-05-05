import { prisma } from "../db.js";

export async function audit(action: string, description: string): Promise<void> {
  await prisma.auditEntry.create({
    data: { action, description },
  });
}
