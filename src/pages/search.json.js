import { readdir, readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  const evenementsDir = path.join(process.cwd(), 'src/content/evenements');
  const fichiers = await readdir(evenementsDir);

  const evenements = await Promise.all(
    fichiers
      .filter(f => f.endsWith('.json'))
      .map(async f => {
        const contenu = await readFile(path.join(evenementsDir, f), 'utf-8');
        const data = JSON.parse(contenu);
        const slug = f.replace('.json', '');
        const tousLesTags = [...new Set(data.photos.flatMap(p => p.tags))].filter(Boolean);
        return {
          slug,
          titre: data.titre,
          date: data.date,
          description: data.description,
          tags: tousLesTags,
          nbPhotos: data.photos.length,
        };
      })
  );

  return new Response(JSON.stringify(evenements), {
    headers: { 'Content-Type': 'application/json' }
  });
}