import { LegalDocument } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AuthUser } from '../auth/auth.middleware.js';
import { CreateLegalAcceptanceDTO } from '../../schemas/legal.js';

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
    },
  });

  return { acceptance: formatAcceptance(created), created: true };
}

export const legalService = {
  listCurrentDocuments,
  getCurrentDocumentBySlug,
  assertMatchesCurrentDocument,
  recordAcceptance,
};
