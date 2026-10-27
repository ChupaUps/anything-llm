#!/usr/bin/env node
/**
 * Provisions the personal workspace of every `default` user that does not own
 * one yet - accounts created before personal workspaces existed and users that
 * are only members of shared workspaces. Workspace identifiers are derived from
 * the login (`<login>`, `<login>-2`, ...) so they are traceable to the account.
 *
 *   cd server && yarn backfill:workspaces
 *   cd server && yarn backfill:workspaces --name "Моя Рабочая Область"
 *
 * Workspaces provisioned before the login-based identifiers existed can be
 * renamed with `--align-slugs`. Only empty personal workspaces are renamed, so
 * an existing vector namespace is never orphaned:
 *
 *   cd server && yarn backfill:workspaces --align-slugs
 *
 * The script is idempotent: users that already own a personal workspace are
 * skipped, so it is safe to run again after every deployment.
 */
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const prisma = require("../utils/prisma");
const { Workspace } = require("../models/workspace");

const DEFAULT_NAME = "My Workspace";

/**
 * Reads `--name <value>` / `--name=<value>` and `--align-slugs` from the CLI.
 * @param {string[]} argv
 * @returns {{name: string, alignSlugs: boolean}}
 */
function parseArgs(argv = []) {
  const args = { name: DEFAULT_NAME, alignSlugs: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--align-slugs") {
      args.alignSlugs = true;
      continue;
    }
    if (arg === "--name" && argv[index + 1]) {
      args.name = argv[++index];
      continue;
    }
    if (arg.startsWith("--name=")) args.name = arg.slice("--name=".length);
  }
  return args;
}

/**
 * Renames personal workspaces whose identifier does not match the owner login.
 * Workspaces that already carry documents are reported instead of renamed -
 * their vector namespace is keyed by the old slug.
 * @param {object[]} users
 * @returns {Promise<{renamed: number, kept: number}>}
 */
async function alignSlugs(users = []) {
  let renamed = 0;
  let kept = 0;
  for (const user of users) {
    const personal = await Workspace.personalForOwner(user.id);
    if (!personal) continue;
    const expected = Workspace.personalSlugBase(user);
    if (
      personal.slug === expected ||
      personal.slug.startsWith(`${expected}-`)
    )
      continue;

    const documents = await prisma.workspace_documents.count({
      where: { workspaceId: personal.id },
    });
    if (documents > 0) {
      kept++;
      console.log(
        `[workspaces backfill] kept "${personal.slug}" for ${user.username} (${documents} documents embedded)`
      );
      continue;
    }

    const slug = await Workspace.uniquePersonalSlug(user);
    await prisma.workspaces.update({
      where: { id: personal.id },
      data: { slug },
    });
    renamed++;
    console.log(
      `[workspaces backfill] renamed "${personal.slug}" -> "${slug}" for ${user.username}`
    );
  }
  return { renamed, kept };
}

async function main() {
  const { name, alignSlugs: shouldAlign } = parseArgs(process.argv.slice(2));
  const users = await prisma.users.findMany({
    where: { role: "default", suspended: 0 },
    orderBy: { id: "asc" },
  });
  console.log(
    `[workspaces backfill] ${users.length} active default users, name="${name}"`
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const user of users) {
    const existing = await Workspace.personalForOwner(user.id);
    if (existing) {
      skipped++;
      continue;
    }

    const workspace = await Workspace.ensurePersonalWorkspace(user, name);
    if (!workspace) {
      failed++;
      console.log(`[workspaces backfill] skipped user #${user.id} (quota is 0)`);
      continue;
    }

    created++;
    console.log(
      `[workspaces backfill] created "${workspace.slug}" for ${user.username} (#${user.id})`
    );
  }

  console.log(
    `[workspaces backfill] done - created ${created}, already had one ${skipped}, failed ${failed}.`
  );

  if (shouldAlign) {
    const { renamed, kept } = await alignSlugs(users);
    console.log(
      `[workspaces backfill] slug alignment done - renamed ${renamed}, kept ${kept} with documents.`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[workspaces backfill] failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
