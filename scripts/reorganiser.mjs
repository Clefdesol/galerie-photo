import { readdir, mkdir, rm, stat } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const SOURCES_DIR = './sources/evenements';
const PUBLIC_DIR = './public/evenements';

// Retourne tous les chemins de dossiers relatifs sous une racine (récursif)
async function listerDossiers(racine, base = '') {
  const dossiers = new Set();
  let entries;
  try {
    entries = await readdir(path.join(racine, base));
  } catch {
    return dossiers;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const rel = base ? `${base}/${entry}` : entry;
    const fullPath = path.join(racine, rel);
    const s = await stat(fullPath).catch(() => null);
    if (s?.isDirectory()) {
      dossiers.add(rel);
      const enfants = await listerDossiers(racine, rel);
      for (const e of enfants) dossiers.add(e);
    }
  }
  return dossiers;
}

// Retourne toutes les photos source sans -opt (relatifs à SOURCES_DIR)
async function listerPhotosSource(dossierRel) {
  const photos = [];
  const fullPath = path.join(SOURCES_DIR, dossierRel);
  let entries;
  try {
    entries = await readdir(fullPath);
  } catch {
    return photos;
  }
  for (const entry of entries) {
    if (entry.match(/\.(jpg|jpeg)$/i) && !entry.includes('-opt.')) {
      photos.push(path.join(dossierRel, entry));
    }
  }
  return photos;
}

async function optimiserPhoto(sourceRel) {
  const sourcePath = path.join(SOURCES_DIR, sourceRel);
  const optName = path.basename(sourceRel).replace(/\.(jpg|jpeg)$/i, '-opt.jpg');
  const optPath = path.join(PUBLIC_DIR, path.dirname(sourceRel), optName);

  const existe = await stat(optPath).catch(() => null);
  if (existe) return false;

  await sharp(sourcePath)
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(optPath);
  return true;
}

async function main() {
  const dossiersSources = await listerDossiers(SOURCES_DIR);
  const dossiersPublic = await listerDossiers(PUBLIC_DIR);

  // 1. Créer les dossiers manquants dans public/
  let crees = 0;
  for (const rel of dossiersSources) {
    if (!dossiersPublic.has(rel)) {
      await mkdir(path.join(PUBLIC_DIR, rel), { recursive: true });
      console.log(`+ ${rel}`);
      crees++;
    }
  }

  // 2. Supprimer les dossiers qui n'existent plus dans sources/
  // Traiter du plus profond au moins profond pour éviter les erreurs de suppression
  const aSupprimer = [...dossiersPublic]
    .filter(rel => !dossiersSources.has(rel))
    .sort((a, b) => b.split('/').length - a.split('/').length);

  let supprimes = 0;
  for (const rel of aSupprimer) {
    const fullPath = path.join(PUBLIC_DIR, rel);
    // Vérifier que le dossier parent n'a pas déjà été supprimé
    const existe = await stat(fullPath).catch(() => null);
    if (!existe) continue;
    await rm(fullPath, { recursive: true, force: true });
    console.log(`- ${rel}`);
    supprimes++;
  }

  // 3. Optimiser les nouvelles photos
  let optimisees = 0;
  const tousLesDossiers = ['', ...dossiersSources];
  for (const dossierRel of tousLesDossiers) {
    const photos = await listerPhotosSource(dossierRel);
    for (const photoRel of photos) {
      const fait = await optimiserPhoto(photoRel);
      if (fait) {
        console.log(`✓ ${photoRel}`);
        optimisees++;
      }
    }
  }

  console.log(`\nTerminé : ${crees} dossier(s) créé(s), ${supprimes} supprimé(s), ${optimisees} photo(s) optimisée(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
