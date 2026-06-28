import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

const bucket = 'client-documents';
const outputRoot = process.argv[2];
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!outputRoot) throw new Error('Dossier de destination manquant.');
if (!url || !secret) throw new Error('SUPABASE_URL ou SUPABASE_SECRET_KEY manquant.');

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const root = path.resolve(outputRoot);
let copiedFiles = 0;
let copiedBytes = 0;

function destinationFor(objectPath) {
  const normalized = path.posix.normalize(String(objectPath).replaceAll('\\', '/'));
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new Error(`Chemin Storage refusé : ${objectPath}`);
  }
  const destination = path.resolve(root, ...normalized.split('/'));
  if (destination !== root && !destination.startsWith(root + path.sep)) {
    throw new Error(`Chemin Storage non sûr : ${objectPath}`);
  }
  return destination;
}

async function listAll(prefix = '') {
  const entries = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Impossible de lister « ${prefix || '/'} » : ${error.message}`);

    entries.push(...(data || []));
    if (!data || data.length < limit) break;
    offset += limit;
  }

  return entries;
}

async function downloadObject(objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw new Error(`Téléchargement impossible « ${objectPath} » : ${error.message}`);

  const file = destinationFor(objectPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(file, buffer);
  copiedFiles += 1;
  copiedBytes += buffer.length;
  console.log(`Copié : ${objectPath}`);
}

async function walk(prefix = '') {
  const entries = await listAll(prefix);
  for (const entry of entries) {
    const name = String(entry.name || '');
    if (!name) continue;
    const objectPath = prefix ? `${prefix}/${name}` : name;

    // Dans l'API Storage, les dossiers sont renvoyés sans identifiant d'objet.
    if (entry.id === null || entry.id === undefined) {
      await walk(objectPath);
    } else {
      await downloadObject(objectPath);
    }
  }
}

await fs.mkdir(root, { recursive: true });
await walk();

const manifest = {
  bucket,
  created_at_utc: new Date().toISOString(),
  files: copiedFiles,
  bytes: copiedBytes,
};
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Documents sauvegardés : ${copiedFiles} fichier(s), ${copiedBytes} octet(s).`);
