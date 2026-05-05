import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROGRAMS = [
  {
    slug: "obras_ff11",
    name: "Obras FF 11",
    family: "FAMILIA1",
    order: 1,
    sheetAliases: ["^Obras\\s+\\d{4}\\s+FF\\s*11\\b"],
  },
  {
    slug: "obras_ff12",
    name: "Obras FF 12",
    family: "FAMILIA1",
    order: 2,
    sheetAliases: ["^Obras\\s+\\d{4}\\s+FF\\s*12\\b"],
  },
  {
    slug: "bid_4416",
    name: "BID 4416",
    family: "FAMILIA2",
    order: 3,
    sheetAliases: ["^BID\\s*4416\\b"],
  },
  {
    slug: "bid_5418",
    name: "BID 5418",
    family: "FAMILIA2",
    order: 4,
    sheetAliases: ["^BID\\s*5418\\b"],
  },
  {
    slug: "caf_11",
    name: "CAF 11",
    family: "FAMILIA2",
    order: 5,
    sheetAliases: ["^CAF\\b"],
  },
  {
    slug: "fonplata",
    name: "FONPLATA",
    family: "FAMILIA2",
    order: 6,
    sheetAliases: ["^FONPLATA\\b"],
  },
];

async function main() {
  for (const p of PROGRAMS) {
    await prisma.program.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        family: p.family,
        order: p.order,
        sheetAliases: JSON.stringify(p.sheetAliases),
      },
      create: {
        slug: p.slug,
        name: p.name,
        family: p.family,
        order: p.order,
        sheetAliases: JSON.stringify(p.sheetAliases),
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${PROGRAMS.length} programs.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
