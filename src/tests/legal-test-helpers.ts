import { prisma } from '../lib/prisma.js';
import { applyManifest } from '../modules/legal/legal-sync.service.js';
import {
  CHECKOUT_REQUIRED_SLUGS,
  REGISTER_REQUIRED_SLUGS,
} from '../modules/legal/legal.service.js';
import { LegalAcceptanceItem } from '../schemas/legal.js';

const FIXTURE_TITLES: Record<string, string> = {
  'termos-de-uso': 'Termos de Uso',
  'politica-de-privacidade': 'Política de Privacidade',
  'contrato-saas': 'Contrato SaaS',
  'politica-de-cookies': 'Política de Cookies',
  'aviso-lgpd': 'Aviso LGPD',
};

export const ALL_LEGAL_SLUGS = [
  'termos-de-uso',
  'politica-de-privacidade',
  'contrato-saas',
  'politica-de-cookies',
  'aviso-lgpd',
] as const;

function fixtureHash(slug: string): string {
  const seed = slug.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hex = (seed % 16).toString(16);
  return `sha256:${hex.repeat(64)}`;
}

async function ensureCurrentDocuments(slugs: readonly string[]) {
  const existing = await prisma.legalDocument.findMany({
    where: { slug: { in: [...slugs] }, isCurrent: true },
  });

  if (existing.length === slugs.length) {
    return existing;
  }

  await applyManifest({
    generatedAt: new Date().toISOString(),
    documents: slugs.map((slug) => ({
      slug,
      title: FIXTURE_TITLES[slug] || slug,
      version: '2026-09-02',
      frbrWork: `/akn/br/doc/autocatalogo/${slug}`,
      frbrExpression: `/akn/br/doc/autocatalogo/${slug}/2026-09-02`,
      path: `akn/${slug}/2026-09-02.xml`,
      contentHash: fixtureHash(slug),
      publishedAt: '2026-09-02',
    })),
  });

  return prisma.legalDocument.findMany({
    where: { slug: { in: [...slugs] }, isCurrent: true },
  });
}

function toAcceptanceItems(docs: Array<{ slug: string; version: string; contentHash: string }>): LegalAcceptanceItem[] {
  return docs.map((doc) => ({
    slug: doc.slug,
    version: doc.version,
    contentHash: doc.contentHash,
    acceptedAt: new Date(Date.now() - 60_000).toISOString(),
  }));
}

export async function registerLegalAcceptances(): Promise<LegalAcceptanceItem[]> {
  const docs = await ensureCurrentDocuments(REGISTER_REQUIRED_SLUGS);
  return toAcceptanceItems(docs);
}

export async function checkoutLegalAcceptances(): Promise<LegalAcceptanceItem[]> {
  const docs = await ensureCurrentDocuments(CHECKOUT_REQUIRED_SLUGS);
  return toAcceptanceItems(docs);
}

export async function ensureAllLegalDocuments() {
  return ensureCurrentDocuments(ALL_LEGAL_SLUGS);
}

export async function withRegisterConsent<T extends Record<string, unknown>>(
  payload: T,
): Promise<T & { legalAcceptances: LegalAcceptanceItem[] }> {
  return {
    ...payload,
    legalAcceptances: await registerLegalAcceptances(),
  };
}
