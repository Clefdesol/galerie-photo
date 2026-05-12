import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import exifr from 'exifr';

const EVENEMENTS_DIR = './public/evenements';
const CONTENT_DIR = './src/content/evenements';

function fixEncoding(str) {
  if (!str) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

async function lireJsonExistant(jsonPath) {
  try {
    const contenu = await readFile(jsonPath, 'utf-8');
    return JSON.parse(contenu);
  } catch {
    return null;
  }
}

async function trouverPremierePhoto(contentPath, sousEvenements) {
  for (const sous of sousEvenements) {
    try {
      const sousJson = await readFile(path.join(contentPath, sous, '_index.json'), 'utf-8');
      const sousData = JSON.parse(sousJson);
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
    } else if (entry.match(/\.(jpg|jpeg)$/i)) {
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
      photosData.push({ fichier: photo, titre, tags, date: date ? date.toISOString() : null });
      console.log(`${indent}  ✅ ${photo} — tags: [${tags.join(', ')}]`);
    } catch {
      console.log(`${indent}  ⚠️  ${photo} — pas de métadonnées`);
      photosData.push({ fichier: photo, titre: photo, tags: [], date: null });
    }
  }

  const sousEvenements = [];
  for (const sousDossier of sousDossiers) {
    const sousDossierPath = path.join(dossierPath, sousDossier);
    const sousContentPath = path.join(contentPath, sousDossier);
    await traiterDossier(sousDossierPath, sousContentPath, niveau + 1);
    sousEvenements.push(sousDossier);
  }

  const type = photos.length === 0 && sousDossiers.length > 0 ? 'categorie' : 'evenement';

  await mkdir(contentPath, { recursive: true });
  const jsonPath = path.join(contentPath, '_index.json');
  const existant = await lireJsonExistant(jsonPath);

  const premierDate = photosData.find(p => p.date)?.date || new Date().toISOString();

  // Couverture : préserver l'existante, sinon première photo, sinon chercher dans sous-dossiers
  let couverture = existant?.couverture || '';
  if (!couverture || couverture.includes('__FIRST__')) {
    couverture = photosData[0]?.fichier || await trouverPremierePhoto(contentPath, sousEvenements);
  }

  const data = {
    titre: existant?.titre || nomDossier.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    type,
    date: existant?.date || premierDate.split('T')[0],
    "_aide_description": "Pour un saut de ligne, utilisez \\n entre les phrases",
    description: existant?.description || '',
    couverture,
    videos: existant?.videos || [],
    sousEvenements,
    photos: photosData,
  };

  await writeFile(jsonPath, JSON.stringify(data, null, 2));
  console.log(`${indent}  💾 _index.json généré !`);
}

const dossiers = (await readdir(EVENEMENTS_DIR)).filter(d => !d.startsWith('.'));

for (const dossier of dossiers) {
  const dossierPath = path.join(EVENEMENTS_DIR, dossier);
  const s = await stat(dossierPath);
  if (!s.isDirectory()) continue;
  const contentPath = path.join(CONTENT_DIR, dossier);
  await traiterDossier(dossierPath, contentPath);
}

console.log('\n✨ Import terminé !');