import { readdir, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import exifr from 'exifr';

const EVENEMENTS_DIR = './public/evenements';
const CONTENT_DIR = './src/content/evenements';

// Lit tous les dossiers d'événements
const dossiers = (await readdir(EVENEMENTS_DIR)).filter(d => !d.startsWith('.'));

function fixEncoding(str) {
  if (!str) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

for (const dossier of dossiers) {
  const dossierPath = path.join(EVENEMENTS_DIR, dossier);
  const fichiers = await readdir(dossierPath);
  const photos = fichiers.filter(f => f.match(/\.(jpg|jpeg)$/i));

  if (photos.length === 0) continue;

  console.log(`\n📁 Traitement de : ${dossier} (${photos.length} photos)`);

  const photosData = [];

  for (const photo of photos) {
    const photoPath = path.join(dossierPath, photo);
    
    try {
      const exif = await exifr.parse(photoPath, {
  iptc: true,
  xmp: true,
  encoding: 'utf8',
});
      // Extraction des mots-clés Lightroom
      const tags = [];
      if (exif?.Keywords) {
        if (Array.isArray(exif.Keywords)) tags.push(...exif.Keywords.map(fixEncoding));
        else tags.push(fixEncoding(exif.Keywords));
      }

      // Titre depuis IPTC ou nom de fichier
      const titre = exif?.ObjectName || exif?.Title || photo.replace(/\.[^/.]+$/, '');

      // Date de prise de vue
      const date = exif?.DateTimeOriginal || exif?.CreateDate || null;

      photosData.push({
        fichier: photo,
        titre,
        tags,
        date: date ? date.toISOString() : null,
      });

      console.log(`  ✅ ${photo} — tags: [${tags.join(', ')}]`);
    } catch (e) {
      console.log(`  ⚠️  ${photo} — pas de métadonnées`);
      photosData.push({ fichier: photo, titre: photo, tags: [], date: null });
    }
  }

  // Génère le JSON de l'événement
  const premierDate = photosData.find(p => p.date)?.date || new Date().toISOString();
  
  const evenement = {
    titre: dossier.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    date: premierDate.split('T')[0],
    description: '',
    couverture: photosData[0].fichier,
    photos: photosData,
  };

  await mkdir(CONTENT_DIR, { recursive: true });
  await writeFile(
    path.join(CONTENT_DIR, `${dossier}.json`),
    JSON.stringify(evenement, null, 2)
  );

  console.log(`  💾 ${dossier}.json généré !`);
}

console.log('\n✨ Import terminé !');