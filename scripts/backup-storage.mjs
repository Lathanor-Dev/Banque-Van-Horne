import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

const bucket = 'client-documents';
const outputRoot = process.argv[2];
const rawProjectUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!outputRoot) throw new Error('Dossier de destination manquant.');
if (!rawProjectUrl || !secretKey) {
  throw new Error('SUPABASE_URL ou SUPABASE_SECRET_KEY manquant.');
}

/*
  Le secret SUPABASE_URL peut parfois avoir été enregistré avec /rest/v1.
  supabase-js attend l'URL racine du projet ; on normalise donc l'URL ici.
*/
function normaliseProjectUrl(value) {
  const cleaned = String(value).trim().replace(/^['"]|['"]$/g, '');
  const parsed = new URL(cleaned);
  parsed.pathname = parsed.pathname
    .replace(/\/(?:rest|storage)\/v1\/?$/i, '/')
    .replace(/\/+$/, '/');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

const projectUrl = normaliseProjectUrl(rawProjectUrl);
const supabase = createClient(projectUrl, secretKey, {
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

async function readDocumentRows() {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('pret_client_documents')
      .select('id, storage_path, filename, mime_type, created_at')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Impossible de lire le registre des documents clients : ${error.message}`);
    }

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function downloadObject(objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) {
    throw new Error(`Téléchargement impossible « ${objectPath} » : ${error.message}`);
  }

  const destination = destinationFor(objectPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });

  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(destination, buffer);

  copiedFiles += 1;
  copiedBytes += buffer.length;
  console.log(`Copié : ${objectPath}`);
}

await fs.mkdir(root, { recursive: true });

const host = new URL(projectUrl).host;
console.log(`Connexion Supabase : ${host}`);
console.log('Lecture du registre des documents clients…');

/*
  On ne liste plus la racine du bucket. La sauvegarde se base sur les chemins
  réellement enregistrés dans pret_client_documents, puis télécharge chaque
  fichier avec l'API Storage officielle.
*/
const documentRows = await readDocumentRows();
const byStoragePath = new Map();

for (const row of documentRows) {
  const storagePath = String(row.storage_path || '').trim();
  if (storagePath) byStoragePath.set(storagePath, row);
}

for (const storagePath of byStoragePath.keys()) {
  await downloadObject(storagePath);
}

const manifest = {
  bucket,
  source: 'public.pret_client_documents.storage_path',
  created_at_utc: new Date().toISOString(),
  document_rows: documentRows.length,
  files: copiedFiles,
  bytes: copiedBytes,
};

await fs.writeFile(
  path.join(root, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);

console.log(`Documents sauvegardés : ${copiedFiles} fichier(s), ${copiedBytes} octet(s).`);
