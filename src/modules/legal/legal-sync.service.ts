import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { getEnv } from '../../config/env.js';

export const DEFAULT_LEGAL_DOCS_MANIFEST_URL =
  'https://raw.githubusercontent.com/saas-auto-catalogo/legal-docs/main/manifest.json';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Deve ser YYYY-MM-DD');
const contentHash = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/i, 'Deve ser sha256: seguido de 64 hex');

export const legalManifestDocumentSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  version: isoDate,
  frbrWork: z.string().min(1),
  frbrExpression: z.string().min(1),
  path: z.string().min(1),
  contentHash,
  publishedAt: isoDate,
});

export const legalManifestSchema = z.object({
  generatedAt: z.string().min(1),
  documents: z.array(legalManifestDocumentSchema),
});

export type LegalManifest = z.infer<typeof legalManifestSchema>;
export type LegalManifestDocument = z.infer<typeof legalManifestDocumentSchema>;

export interface LegalSyncResult {
  upserted: number;
  currentSlugs: string[];
}

export function getLegalDocsManifestUrl(): string {
  return getEnv().LEGAL_DOCS_MANIFEST_URL || DEFAULT_LEGAL_DOCS_MANIFEST_URL;
}

function publishedAtDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function applyManifest(payload: unknown): Promise<LegalSyncResult> {
  const manifest = legalManifestSchema.parse(payload);
  const now = new Date();
  const currentSlugs = manifest.documents.map((doc) => doc.slug);

  await prisma.$transaction(async (tx) => {
    for (const doc of manifest.documents) {
      await tx.legalDocument.upsert({
        where: {
          slug_version: { slug: doc.slug, version: doc.version },
        },
        create: {
          slug: doc.slug,
          title: doc.title,
          version: doc.version,
          frbrWork: doc.frbrWork,
          frbrExpression: doc.frbrExpression,
          path: doc.path,
          contentHash: doc.contentHash,
          publishedAt: publishedAtDate(doc.publishedAt),
          isCurrent: true,
          syncedAt: now,
        },
        update: {
          title: doc.title,
          frbrWork: doc.frbrWork,
          frbrExpression: doc.frbrExpression,
          path: doc.path,
          contentHash: doc.contentHash,
          publishedAt: publishedAtDate(doc.publishedAt),
          isCurrent: true,
          syncedAt: now,
        },
      });

      await tx.legalDocument.updateMany({
        where: {
          slug: doc.slug,
          NOT: { version: doc.version },
        },
        data: { isCurrent: false },
      });
    }
  });

  return { upserted: manifest.documents.length, currentSlugs };
}

export async function syncFromUrl(url: string = getLegalDocsManifestUrl()): Promise<LegalSyncResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar manifest jurídico (${response.status} ${response.statusText}): ${url}`);
  }

  const payload = await response.json();
  return applyManifest(payload);
}

export const legalSyncService = {
  applyManifest,
  syncFromUrl,
  getLegalDocsManifestUrl,
};
