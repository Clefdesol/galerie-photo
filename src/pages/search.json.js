import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

async function lireEvenementsRecursif(dir, baseDir) {
  const entries = (await readdir(dir)).filter(d => !d.startsWith('.'));
  const evenements = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const s = await stat(fullPath);
    if (!s.isDirectory()) continue;

    const jsonPath = path.join(fullPath, '_index.json');
    try {
      const contenu = await readFile(jsonPath, 'utf-8');
      const data = JSON.parse(contenu);
      const slug = fullPath.replace(baseDir + '/', '');
      const tousLesTags = [...new Set(data.photos?.flatMap(p => p.tags) || [])].filter(Boolean);
      
      evenements.push({
        slug,
        titre: data.titre,
        date: data.date,
        description: data.description || '',
        tags: tousLesTags,
        nbPhotos: data.photos?.length || 0,
        type: data.type,
      });

      // Récursion dans les sous-dossiers
      const sousEvenements = await lireEvenementsRecursif(fullPath, baseDir);
      evenements.push(...sousEvenements);
    } catch {
      continue;
    }
  }

  return evenements;
}

export async function GET() {
  const evenementsDir = path.join(process.cwd(), 'src/content/evenements');
  const evenements = await lireEvenementsRecursif(evenementsDir, evenementsDir);

  return new Response(JSON.stringify(evenements), {
    headers: { 'Content-Type': 'application/json' }
  });
}