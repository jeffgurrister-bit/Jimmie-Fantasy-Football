import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { SyncError, UnknownManagerError } from './errors.ts';
import { normalizeName } from './parse.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MANAGERS_PATH = join(REPO_ROOT, 'data', 'managers.yaml');

/**
 * A manager's participation in one league.
 *
 * Per-league rather than per-manager because status genuinely differs by league:
 * Gil Smit is active in RBB and retired from Dyno Mites. Franchise names live here
 * too — Dyno Mites has them, RBB does not.
 */
export interface ManagerLeague {
  id: string;
  active: boolean;
  first_year?: number;
  last_year?: number;
  franchise?: string;
}

export interface ManagerDef {
  id: string;
  canonical_name: string;
  display_name: string;
  confirmed: boolean;
  leagues: ManagerLeague[];
  first_year?: number;
  last_year?: number;
  /** Active in at least one league. Derived from `leagues` when not given. */
  is_active: boolean;
  aliases: string[];
  notes?: string;
}

export interface LeagueDef {
  id: string;
  name: string;
  short_name: string;
  first_year: number;
  identity_display: 'manager' | 'franchise';
}

export interface UnresolvedQuestion {
  id: string;
  blocks: string[];
  question: string;
}

export interface ManagerMap {
  leagues: LeagueDef[];
  managers: ManagerDef[];
  unresolved: UnresolvedQuestion[];
}

export async function loadManagerMap(path = MANAGERS_PATH): Promise<ManagerMap> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new SyncError(`Could not read the manager identity map at ${path}.`, {
      hint: 'This file is hand-authored and required. It is not generated from the sheets.',
    });
  }
  return parseManagerMap(text);
}

export function parseManagerMap(text: string): ManagerMap {
  const doc = parseYaml(text) as Partial<ManagerMap> | null;
  if (!doc || !Array.isArray(doc.managers)) {
    throw new SyncError('data/managers.yaml is malformed: expected a top-level `managers:` list.');
  }

  const managers = doc.managers.map((m, i) => {
    for (const key of ['id', 'canonical_name', 'display_name'] as const) {
      if (!m?.[key]) {
        throw new SyncError(`Manager #${i + 1} in data/managers.yaml is missing \`${key}\`.`);
      }
    }
    if (!Array.isArray(m.aliases) || m.aliases.length === 0) {
      throw new SyncError(
        `Manager "${m.id}" has no aliases. Every manager needs at least one, spelled ` +
          `exactly as the sheets spell it — otherwise no source row can ever match him.`,
      );
    }
    const leagues = normalizeLeagues(m.leagues, m.id);
    return {
      ...m,
      confirmed: m.confirmed === true,
      leagues,
      // A manager counts as active if any of their leagues does. Stated
      // explicitly only when there is a reason to override.
      is_active: m.is_active ?? leagues.some((l) => l.active),
    } as ManagerDef;
  });

  // A duplicate id would make two people share one identity; a duplicate alias
  // would make one name resolve to two people. Both are silent data corruption,
  // so both are refused at load time.
  const ids = new Set<string>();
  for (const m of managers) {
    if (ids.has(m.id)) {
      throw new SyncError(`Duplicate manager id "${m.id}" in data/managers.yaml.`);
    }
    ids.add(m.id);
  }

  const aliasOwner = new Map<string, string>();
  for (const m of managers) {
    for (const alias of m.aliases) {
      const key = normalizeName(alias);
      const existing = aliasOwner.get(key);
      if (existing && existing !== m.id) {
        throw new SyncError(
          `The alias "${alias}" is claimed by both "${existing}" and "${m.id}" in ` +
            `data/managers.yaml.`,
          {
            hint:
              'One name cannot belong to two managers. Decide which one owns it — this is ' +
              'exactly the collision the identity map exists to prevent.',
          },
        );
      }
      aliasOwner.set(key, m.id);
    }
  }

  return {
    leagues: doc.leagues ?? [],
    managers,
    unresolved: doc.unresolved ?? [],
  };
}

/**
 * Accepts either shorthand or the full form, so the file stays pleasant to edit
 * by hand:
 *
 *   leagues: [rbb]                            # shorthand: active, no franchise
 *   leagues:
 *     - id: dm
 *       active: false
 *       franchise: Orland Park Burnt Ends
 */
function normalizeLeagues(raw: unknown, managerId: string): ManagerLeague[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new SyncError(`\`leagues\` for "${managerId}" must be a list.`);
  }
  return raw.map((entry) => {
    if (typeof entry === 'string') return { id: entry, active: true };
    const e = entry as Partial<ManagerLeague>;
    if (!e.id) {
      throw new SyncError(
        `A league entry for "${managerId}" has no \`id\`. Use the league's short ` +
          `code, e.g. "rbb" or "dm".`,
      );
    }
    return { ...e, id: e.id, active: e.active !== false } as ManagerLeague;
  });
}

export interface ResolverOptions {
  /**
   * Allow unconfirmed identities through. Local preview only — the site badges
   * these managers as provisional. Never use this for a production sync: an
   * unconfirmed identity is a guess about which human owns a championship.
   */
  allowUnconfirmed?: boolean;
}

export class ManagerResolver {
  private readonly byAlias = new Map<string, ManagerDef>();
  private readonly byId = new Map<string, ManagerDef>();
  /** Names seen during a run, so the CLI can report coverage afterwards. */
  readonly seen = new Set<string>();

  constructor(
    readonly map: ManagerMap,
    private readonly options: ResolverOptions = {},
  ) {
    for (const m of map.managers) {
      this.byId.set(m.id, m);
      for (const alias of m.aliases) this.byAlias.set(normalizeName(alias), m);
    }
  }

  /**
   * Resolves a source name string to a manager id.
   *
   * Throws rather than returning null on purpose. There is no safe fallback: a
   * dropped row silently shrinks someone's record, and an invented manager
   * splits one person into two on the all-time leaderboard.
   */
  resolve(rawName: string, sheet: string): string {
    const key = normalizeName(rawName);
    const found = this.byAlias.get(key);
    if (!found) throw new UnknownManagerError(rawName, sheet);
    this.seen.add(found.id);

    if (!found.confirmed && !this.options.allowUnconfirmed) {
      throw new SyncError(
        `The identity of "${rawName}" (mapped to "${found.id}") is not confirmed yet.`,
        {
          sheet,
          hint:
            `data/managers.yaml still marks this manager \`confirmed: false\`, which means ` +
            `nobody has verified which human it is. Answer the open question, set ` +
            `\`confirmed: true\`, and re-run. To preview locally with unverified names, ` +
            `pass --allow-unconfirmed (the site will label them as provisional).`,
        },
      );
    }
    return found.id;
  }

  get(id: string): ManagerDef | undefined {
    return this.byId.get(id);
  }

  get all(): readonly ManagerDef[] {
    return this.map.managers;
  }

  /** Managers who play in the given league, in display-name order. */
  inLeague(leagueId: string): ManagerDef[] {
    return this.map.managers
      .filter((m) => m.leagues.some((l) => l.id === leagueId))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  leagueEntry(managerId: string, leagueId: string): ManagerLeague | undefined {
    return this.byId.get(managerId)?.leagues.find((l) => l.id === leagueId);
  }

  get unconfirmed(): readonly ManagerDef[] {
    return this.map.managers.filter((m) => !m.confirmed);
  }

  /** True when every identity is verified and every open question is answered. */
  get isCleanForProduction(): boolean {
    return this.unconfirmed.length === 0 && this.map.unresolved.length === 0;
  }

  /**
   * A plain-English readiness report. Printed by `pnpm check-managers` and shown
   * on the admin page, because "the site is not live yet because two names are
   * unverified" needs to be legible to the commissioner, not just to a developer.
   */
  readinessReport(): string {
    if (this.isCleanForProduction) {
      return `All ${this.map.managers.length} manager identities are confirmed. Cleared to publish.`;
    }
    const lines: string[] = [];
    if (this.unconfirmed.length > 0) {
      lines.push(
        `${this.unconfirmed.length} of ${this.map.managers.length} manager identities are not ` +
          `confirmed yet:`,
        ...this.unconfirmed.map((m) => `  - ${m.display_name} (${m.canonical_name})`),
      );
    }
    if (this.map.unresolved.length > 0) {
      lines.push('', 'Open questions blocking a verified launch:');
      for (const q of this.map.unresolved) {
        lines.push(`  [${q.id}] ${q.question.trim().replace(/\s+/g, ' ')}`);
      }
    }
    lines.push(
      '',
      'Answer these in data/managers.yaml. Until then the sync will not load real names.',
    );
    return lines.join('\n');
  }
}

export async function createResolver(options: ResolverOptions = {}): Promise<ManagerResolver> {
  return new ManagerResolver(await loadManagerMap(), options);
}
