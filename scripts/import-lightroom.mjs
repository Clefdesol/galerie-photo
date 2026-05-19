import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import exifr from 'exifr';
import sharp from 'sharp';

const EVENEMENTS_DIR = './sources/evenements';
const OPTIMISED_DIR = './public/evenements';
const CONTENT_DIR = './src/content/evenements';

function fixEncoding(str) {
  if (!str) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

async function lireJson(jsonPath) {
  try {
    return JSON.parse(await readFile(jsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

// Cherche la couverture dans les sous-événements déjà générés (src/content)
async function trouverPremierePhoto(contentPath, sousEvenements) {
  for (const sous of sousEvenements) {
    try {
      const sousData = JSON.parse(await readFile(path.join(contentPath, sous, '_index.json'), 'utf-8'));
      if (sousData.couverture && !sousData.couverture.includes('__FIRST__')) {
        return `${sous}/${sousData.couverture}`;
      }
      if (sousData.sousEvenements?.length > 0) {
        const found = await trouverPremierePhoto(path.join(contentPath, sous), sousData.sousEvenements);
        if (found) return `${sous}/${found}`;
      }
    } catch {
      continue;
    }
  }
  return '';
}

async function traiterDossier(dossierPath, contentPath, niveau = 0) {
  const indent = '  '.repeat(niveau);
  const entries = (await readdir(dossierPath)).filter(d => !d.startsWith('.'));

  const photos = [];
  const sousDossiers = [];

  for (const entry of entries) {
    const fullPath = path.join(dossierPath, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      sousDossiers.push(entry);
    } else if (entry.match(/\.(jpg|jpeg)$/i) && !entry.includes('-opt.')) {
      photos.push(entry);
    }
  }

  photos.sort((a, b) => {
    const numA = parseInt(a.match(/^(\d+)/)?.[1] || 0);
    const numB = parseInt(b.match(/^(\d+)/)?.[1] || 0);
    return numA - numB;
  });

  const nomDossier = path.basename(dossierPath);
  console.log(`${indent}📁 ${nomDossier} (${photos.length} photos, ${sousDossiers.length} sous-dossiers)`);

  // Lire les métadonnées depuis sources/ (source de vérité)
  const sourceMeta = await lireJson(path.join(dossierPath, '_index.json'));

  const photosData = [];
  for (const photo of photos) {
    const photoPath = path.join(dossierPath, photo);
    try {
      const exif = await exifr.parse(photoPath, { iptc: true, xmp: true, encoding: 'utf8' });
      const tags = [];
      if (exif?.Keywords) {
        if (Array.isArray(exif.Keywords)) tags.push(...exif.Keywords.map(fixEncoding));
        else tags.push(fixEncoding(exif.Keywords));
      }
      const titre = exif?.ObjectName || exif?.Title || photo.replace(/\.[^/.]+$/, '');
      const date = exif?.DateTimeOriginal || exif?.CreateDate || null;

      const photoOptDir = path.join(OPTIMISED_DIR, path.relative(EVENEMENTS_DIR, dossierPath));
      await mkdir(photoOptDir, { recursive: true });
      const photoOptPath = path.join(photoOptDir, photo.replace(/\.(jpg|jpeg)$/i, '-opt.jpg'));
      if (!await stat(photoOptPath).catch(() => null)) {
        await sharp(photoPath)
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80, progressive: true })
          .toFile(photoOptPath);
      }

      const photoOpt = photo.replace(/\.(jpg|jpeg)$/i, '-opt.jpg');
      photosData.push({ fichier: photoOpt, titre, tags, date: date ? date.toISOString() : null });
      console.log(`${indent}  ✅ ${photo} — tags: [${tags.join(', ')}]`);
    } catch {
      console.log(`${indent}  ⚠️  ${photo} — pas de métadonnées`);
      photosData.push({ fichier: photo, titre: photo, tags: [], date: null });
    }
  }

  const sousEvenements = [];
  for (const sousDossier of sousDossiers) {
    await traiterDossier(path.join(dossierPath, sousDossier), path.join(contentPath, sousDossier), niveau + 1);
    sousEvenements.push(sousDossier);
  }

  // Type : préserver depuis sources/_index.json, sinon déduire
  const typeCalcule = photos.length === 0 && sousDossiers.length > 0 ? 'categorie' : 'evenement';
  const type = sourceMeta?.type || typeCalcule;

  // Pour les catégories, fusionner les sous-dossiers sources avec ceux listés manuellement
  const sousExtra = sourceMeta?.type === 'categorie' ? (sourceMeta?.sousEvenements || []) : [];
  const sousEvenementsFusionnes = [...new Set([...sousExtra, ...sousEvenements])];

  const premierDate = photosData.find(p => p.date)?.date || new Date().toISOString();

  // Couverture : depuis sources/_index.json, convertie en -opt si besoin
  let couverture = sourceMeta?.couverture || '';
  if (couverture && !couverture.includes('-opt.') && !couverture.includes('__FIRST__')) {
    couverture = couverture.replace(/\.(jpg|jpeg)$/i, '-opt.jpg');
  }
  if (!couverture || couverture.includes('__FIRST__')) {
    couverture = photosData[0]?.fichier || await trouverPremierePhoto(contentPath, sousEvenementsFusionnes);
  }

  const data = {
    titre: sourceMeta?.titre || nomDossier.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    type,
    date: sourceMeta?.date || premierDate.split('T')[0],
    "_aide_description": "Pour un saut de ligne, utilisez \\n entre les phrases",
    description: sourceMeta?.description || '',
    couverture,
    "_aide_categories": "Valeurs possibles : admin, famille-proche, famille-eloignee, jargeva, cabasson, public",
    categories: sourceMeta?.categories || ['admin'],
    videos: sourceMeta?.videos || [],
    sousEvenements: sousEvenementsFusionnes,
    photos: photosData,
  };

  await mkdir(contentPath, { recursive: true });
  await writeFile(path.join(contentPath, '_index.json'), JSON.stringify(data, null, 2));
  console.log(`${indent}  💾 _index.json généré !`);
}

const dossiers = (await readdir(EVENEMENTS_DIR)).filter(d => !d.startsWith('.'));

for (const dossier of dossiers) {
  const dossierPath = path.join(EVENEMENTS_DIR, dossier);
  const s = await stat(dossierPath);
  if (!s.isDirectory()) continue;
  await traiterDossier(dossierPath, path.join(CONTENT_DIR, dossier));
}

console.log('\n✨ Import terminé !');
