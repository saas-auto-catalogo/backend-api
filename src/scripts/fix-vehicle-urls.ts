import 'dotenv/config';
import { prisma } from '../lib/prisma.js';

/**
 * Reconciliação de URLs canônicas legadas da 4Boss/Base44 (Issue #90).
 *
 * Localiza veículos cuja canonical_url ainda contém os prefixos quebrados
 * (/api/vehicles/, /api/vehicles/veiculo/, /api/vehicles/v/ ou /veiculo/)
 * e reescreve para o formato oficial /v/:slug.
 *
 * Uso:
 *   npm run script:fix-vehicle-urls
 *   npx tsx src/scripts/fix-vehicle-urls.ts
 */

const LEGACY_PATTERNS = [
  /\/api\/vehicles\/veiculo\//i,
  /\/api\/vehicles\/v\//i,
  /\/veiculo\//i,
  /\/api\/vehicles\//i,
];

function extractSlug(url: string): string | null {
  for (const pattern of LEGACY_PATTERNS) {
    const match = url.match(pattern);
    if (match && match.index !== undefined) {
      const slug = url.slice(match.index + match[0].length).split(/[/?#]/)[0];
      return slug.length > 0 ? slug : null;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const candidates = await prisma.vehicle.findMany({
    where: {
      OR: [
        { canonicalUrl: { contains: '/api/vehicles/' } },
        { canonicalUrl: { contains: '/veiculo/' } },
      ],
    },
    select: { id: true, externalId: true, canonicalUrl: true },
  });

  console.log(`Encontrados ${candidates.length} veículo(s) com URL canônica legada.\n`);

  let updated = 0;
  let skipped = 0;

  for (const vehicle of candidates) {
    const url = vehicle.canonicalUrl || '';
    const origin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return null;
      }
    })();
    const slug = extractSlug(url);

    if (!origin || !slug) {
      console.log(`  ⏭️  ${vehicle.externalId} — sem origin/slug extraível, mantido: ${url}`);
      skipped++;
      continue;
    }

    const newUrl = `${origin}/v/${encodeURIComponent(slug)}`;

    if (newUrl === url) {
      console.log(`  ⏭️  ${vehicle.externalId} — URL já normalizada, mantido: ${url}`);
      skipped++;
      continue;
    }

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { canonicalUrl: newUrl },
    });
    updated++;
    console.log(`  ✅ ${vehicle.externalId}: ${url} → ${newUrl}`);
  }

  console.log(`\nResultado: ${updated} corrigido(s), ${skipped} mantido(s) de ${candidates.length} candidato(s).`);
  await prisma.$disconnect().catch(() => undefined);
}

main().catch(async (err) => {
  console.error('Erro ao executar reconciliação de URLs:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});