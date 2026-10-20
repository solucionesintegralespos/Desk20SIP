// Moves files uploaded before the private store (public/uploads) to storage/uploads, where they
// are only served through app/uploads/[filename] with a session check. URLs do not change.
// Run once with the server stopped: node scripts/move-legacy-uploads.cjs
const fs = require('fs'), path = require('path');
const from = path.join(process.cwd(), 'public', 'uploads');
const to = process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
if (!fs.existsSync(from)) { console.log('No hay archivos en public/uploads.'); process.exit(0); }
fs.mkdirSync(to, { recursive: true });
let moved = 0, skipped = 0;
for (const name of fs.readdirSync(from)) {
  const source = path.join(from, name), target = path.join(to, name);
  if (!fs.statSync(source).isFile() || name.startsWith('.')) continue;
  if (fs.existsSync(target)) { skipped++; continue; }
  fs.renameSync(source, target); moved++;
}
console.log(`Movidos ${moved} archivos a ${to}${skipped ? `; ${skipped} ya existían y se dejaron en public/uploads` : ''}.`);
