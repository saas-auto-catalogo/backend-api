import { prisma } from './prisma.js';

export function slugifyWorkspaceName(workspaceName: string): string {
  return workspaceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 90) || 'workspace';
}

export async function generateUniqueWorkspaceSlug(workspaceName: string): Promise<string> {
  const baseSlug = slugifyWorkspaceName(workspaceName);
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.workspace.findUnique({ where: { slug: candidate } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return candidate;
}
