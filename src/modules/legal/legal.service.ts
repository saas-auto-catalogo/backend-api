import { LegalDocument, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AuthUser } from '../auth/auth.middleware.js';
import { CreateLegalAcceptanceDTO, LegalAcceptanceItem } from '../../schemas/legal.js';

export const REGISTER_REQUIRED_SLUGS = ['termos-de-uso', 'politica-de-privacidade'] as const;
export const CHECKOUT_REQUIRED_SLUGS = ['contrato-saas'] as const;

export class LegalAcceptanceMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalAcceptanceMismatchError';
  }
}

export class LegalWorkspaceForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalWorkspaceForbiddenError';
  }
}

export interface LegalDocumentPublic {
  slug: string;
  title: string;
  version: string;
  contentHash: string;
  frbrExpression: string;
  publishedAt: string;
  path: string;
}

export interface LegalAcceptancePublic {
  id: string;
  slug: string;
  version: string;
  contentHash: string;
  acceptedAt: string;
  workspaceId: string | null;
}

function formatPublishedAt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatLegalDocument(doc: LegalDocument): LegalDocumentPublic {
  return {
    slug: doc.slug,
    title: doc.title,
    version: doc.version,
    contentHash: doc.contentHash,
    frbrExpression: doc.frbrExpression,
    publishedAt: formatPublishedAt(doc.publishedAt),
    path: doc.path,
  };
}

function formatAcceptance(row: {
  id: string;
  slug: string;
  version: string;
  contentHash: string;
  acceptedAt: Date;
  workspaceId: string | null;
}): LegalAcceptancePublic {
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    contentHash: row.contentHash,
    acceptedAt: row.acceptedAt.toISOString(),
    workspaceId: row.workspaceId,
  };
}

export async function listCurrentDocuments(): Promise<LegalDocumentPublic[]> {
  const docs = await prisma.legalDocument.findMany({
    where: { isCurrent: true },
    orderBy: { slug: 'asc' },
  });
  return docs.map(formatLegalDocument);
}

export async function getCurrentDocumentBySlug(slug: string): Promise<LegalDocumentPublic | null> {
  const doc = await prisma.legalDocument.findFirst({
    where: { slug, isCurrent: true },
  });
  return doc ? formatLegalDocument(doc) : null;
}

export async function assertMatchesCurrentDocument(params: {
  slug: string;
  version: string;
  contentHash: string;
}): Promise<LegalDocument> {
  const current = await prisma.legalDocument.findFirst({
    where: { slug: params.slug, isCurrent: true },
  });

  if (!current) {
    throw new LegalAcceptanceMismatchError(
      `Documento vigente "${params.slug}" não encontrado.`,
    );
  }

  if (current.version !== params.version || current.contentHash !== params.contentHash) {
    throw new LegalAcceptanceMismatchError(
      `Aceite de "${params.slug}" não corresponde à versão vigente (${current.version}).`,
    );
  }

  return current;
}

export async function assertRequiredAcceptances(
  items: LegalAcceptanceItem[],
  requiredSlugs: readonly string[],
): Promise<void> {
  const bySlug = new Map(items.map((item) => [item.slug, item]));

  for (const slug of requiredSlugs) {
    const item = bySlug.get(slug);
    if (!item) {
      throw new LegalAcceptanceMismatchError(`Aceite obrigatório ausente: "${slug}".`);
    }
    await assertMatchesCurrentDocument(item);
  }
}

export async function persistAcceptances(params: {
  userId: string;
  workspaceId?: string | null;
  items: LegalAcceptanceItem[];
  requiredSlugs: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const db = params.tx ?? prisma;
  const required = new Set(params.requiredSlugs);
  const ipAddress = params.ipAddress?.substring(0, 50) || null;
  const userAgent = params.userAgent?.substring(0, 500) || null;

  for (const item of params.items) {
    if (!required.has(item.slug)) {
      continue;
    }

    const existing = await db.legalAcceptance.findUnique({
      where: {
        userId_slug_version: {
          userId: params.userId,
          slug: item.slug,
          version: item.version,
        },
      },
    });

    if (existing) {
      continue;
    }

    await db.legalAcceptance.create({
      data: {
        userId: params.userId,
        workspaceId: params.workspaceId ?? null,
        slug: item.slug,
        version: item.version,
        contentHash: item.contentHash,
        acceptedAt: new Date(item.acceptedAt),
        ipAddress,
        userAgent,
      },
    });
  }
}

async function assertWorkspaceMembership(user: AuthUser, workspaceId: string): Promise<void> {
  if (user.isSuperAdmin || user.role === 'SUPER_ADMIN') {
    return;
  }

  if (user.workspaceId === workspaceId) {
    return;
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      uq_workspace_user: { workspaceId, userId: user.id },
    },
  });

  if (!membership) {
    throw new LegalWorkspaceForbiddenError(
      `Você não tem autorização para registrar aceite no workspace "${workspaceId}".`,
    );
  }
}

export async function recordAcceptance(
  user: AuthUser,
  body: CreateLegalAcceptanceDTO,
  audit?: { ipAddress?: string; userAgent?: string },
): Promise<{ acceptance: LegalAcceptancePublic; created: boolean }> {
  await assertMatchesCurrentDocument({
    slug: body.slug,
    version: body.version,
    contentHash: body.contentHash,
  });

  if (body.workspaceId) {
    await assertWorkspaceMembership(user, body.workspaceId);
  }

  const existing = await prisma.legalAcceptance.findUnique({
    where: {
      userId_slug_version: {
        userId: user.id,
        slug: body.slug,
        version: body.version,
      },
    },
  });

  if (existing) {
    return { acceptance: formatAcceptance(existing), created: false };
  }

  const created = await prisma.legalAcceptance.create({
    data: {
      userId: user.id,
      workspaceId: body.workspaceId ?? null,
      slug: body.slug,
      version: body.version,
      contentHash: body.contentHash,
      acceptedAt: new Date(body.acceptedAt),
      ipAddress: audit?.ipAddress?.substring(0, 50) || null,
      userAgent: audit?.userAgent?.substring(0, 500) || null,
    },
  });

  return { acceptance: formatAcceptance(created), created: true };
}

export const legalService = {
  listCurrentDocuments,
  getCurrentDocumentBySlug,
  assertMatchesCurrentDocument,
  assertRequiredAcceptances,
  persistAcceptances,
  recordAcceptance,
};
