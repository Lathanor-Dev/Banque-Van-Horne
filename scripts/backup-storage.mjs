import fs from 'node:fs/promises';
import path from 'node:path';

const bucket = 'client-documents';
const outputRoot = process.argv[2];
const projectUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!outputRoot) throw new Error('Dossier de destination manquant.');
if (!projectUrl || !secretKey) {
  throw new Error('SUPABASE_URL ou SUPABASE_SECRET_KEY manquant.');
}

const baseUrl = projectUrl.replace(/\/+$/, '');
const root = path.resolve(outputRoot);
let copiedFiles = 0;
let copiedBytes = 0;
const visitedPrefixes = new Set();

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

function encodeStoragePath(objectPath) {
  return String(objectPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function readError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

async function listAll(prefix = '') {
  const entries = [];
  const limit = 1000;
  let offset = 0;

  // Appel HTTP direct : il évite le chemin racine invalide produit par certaines
  // versions de supabase-js lorsqu'on liste la racine du bucket.
  const endpoint = `${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`;

  while (true) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Impossible de lister « ${prefix || '/'} » : ${await readError(response)}`);
    }

    const payload = await response.json();
    const data = Array.isArray(payload) ? payload : (payload?.data || []);
    entries.push(...data);

    if (data.length < limit) break;
    offset += limit;
  }

  return entries;
}

async function downloadObject(objectPath) {
  const endpoint = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Téléchargement impossible « ${objectPath} » : ${await readError(response)}`);
  }

  const file = destinationFor(objectPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(file, buffer);

  copiedFiles += 1;
  copiedBytes += buffer.length;
  console.log(`Copié : ${objectPath}`);
}

async function walk(prefix = '') {
  if (visitedPrefixes.has(prefix)) return;
  visitedPrefixes.add(prefix);

  const entries = await listAll(prefix);
  for (const entry of entries) {
    const name = String(entry?.name || '');
    if (!name) continue;

    const objectPath = prefix ? `${prefix}/${name}` : name;
    // Supabase renvoie les dossiers sans identifiant d'objet ; seuls les fichiers ont un id.
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
