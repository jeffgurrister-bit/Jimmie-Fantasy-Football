/**
 * The sync fails loudly and specifically. Every error names the sheet and, where
 * relevant, the column — because the person who will eventually hit one of these
 * is the commissioner after renaming a spreadsheet column, and "unexpected
 * token" tells him nothing while "the GameData sheet no longer has a column
 * called 'Proj. Score'" tells him exactly what he broke.
 */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly detail?: { sheet?: string; column?: string; row?: number; hint?: string },
  ) {
    super(message);
    this.name = 'SyncError';
  }

  /** Multi-line, human-readable rendering for CLI output and the admin page. */
  override toString(): string {
    const lines = [`${this.name}: ${this.message}`];
    if (this.detail?.sheet) lines.push(`  sheet:  ${this.detail.sheet}`);
    if (this.detail?.column) lines.push(`  column: ${this.detail.column}`);
    if (this.detail?.row !== undefined) lines.push(`  row:    ${this.detail.row}`);
    if (this.detail?.hint) lines.push(`  fix:    ${this.detail.hint}`);
    return lines.join('\n');
  }
}

/** Raised when a source name string has no entry in data/managers.yaml. */
export class UnknownManagerError extends SyncError {
  constructor(name: string, sheet: string) {
    super(
      `The name "${name}" appears in the ${sheet} sheet but is not listed in data/managers.yaml.`,
      {
        sheet,
        hint:
          `Add "${name}" to the \`aliases\` list of whichever manager it belongs to in ` +
          `data/managers.yaml. Do not guess — if two managers could plausibly own this ` +
          `name, ask before mapping it.`,
      },
    );
    this.name = 'UnknownManagerError';
  }
}
