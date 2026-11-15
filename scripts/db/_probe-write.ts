import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  try {
    const ro = await p.$queryRawUnsafe<any[]>(`SHOW transaction_read_only`);
    console.log("transaction_read_only:", ro);
    const s = await p.$queryRawUnsafe<any[]>(
      `SELECT current_setting('default_transaction_read_only') as def_ro, pg_database_size(current_database()) as db_size_bytes`,
    );
    console.log("settings:", s);
    const dbSizeMB = Number(s[0].db_size_bytes) / 1024 / 1024;
    console.log("DB size MB:", dbSizeMB.toFixed(1));
    const t0 = Date.now();
    await p.$executeRawUnsafe(`CREATE TEMP TABLE _write_probe(x int)`);
    await p.$executeRawUnsafe(`INSERT INTO _write_probe VALUES (1)`);
    console.log("WRITE OK in", Date.now() - t0, "ms");
  } catch (e: any) {
    console.error("WRITE FAILED:", e?.message ?? e);
    process.exit(2);
  } finally {
    await p.$disconnect();
  }
})();
