require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$transaction(async tx => {
    const records = await tx.serviceRecord.findMany({ where: { kind: 'checklists' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    let changed = 0;
    for (const record of records) {
      const payload = record.payload;
      if (/^\d{2}-\d{3,}$/.test(payload.number || '')) continue;
      const date = payload.createdAt && Number.isFinite(Date.parse(payload.createdAt)) ? new Date(payload.createdAt) : record.createdAt;
      const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Bogota' }).format(date);
      const key = `checklists:${year}`;
      // Retain any already assigned numbers when re-running this migration.
      const highest = records.reduce((max, row) => {
        const match = String(row.payload.number || '').match(/^(\d{2})-(\d{3,})$/);
        return match && match[1] === year.slice(-2) ? Math.max(max, Number(match[2])) : max;
      }, 0);
      await tx.serviceCounter.upsert({ where: { key }, create: { key, value: highest }, update: {} });
      await tx.serviceCounter.updateMany({ where: { key, value: { lt: highest } }, data: { value: highest } });
      const counter = await tx.serviceCounter.update({ where: { key }, data: { value: { increment: 1 } } });
      const number = `${year.slice(-2)}-${String(counter.value).padStart(3, '0')}`;
      const updated = await tx.serviceRecord.updateMany({ where: { id: record.id, revision: record.revision }, data: { payload: { ...payload, number }, previousNumber: record.previousNumber || payload.number, revision: { increment: 1 } } });
      if (!updated.count) throw Error('Un checklist cambió durante la actualización. Ejecuta nuevamente.');
      changed++;
    }
    return changed;
  }, { timeout: 60000 });
  console.log(`Checklists renumerados: ${result}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
