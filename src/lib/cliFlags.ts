export interface ScanFlags {
  verbose: boolean;
  threats: boolean;
  network: boolean;
  vpn: boolean;
  geo: boolean;
  sources: boolean;
  json: boolean;
}

export interface ParsedCommand {
  type: string;
  value: string;
  flags: ScanFlags;
}

export function parseFlags(args: string[]): { flags: ScanFlags; remainingArgs: string[] } {
  const flags: ScanFlags = {
    verbose: false,
    threats: false,
    network: false,
    vpn: false,
    geo: false,
    sources: false,
    json: false,
  };

  const remainingArgs: string[] = [];

  for (const arg of args) {
    const lower = arg.toLowerCase();

    if (lower === '-v' || lower === '--verbose') {
      flags.verbose = true;
    } else if (lower === '--threats') {
      flags.threats = true;
    } else if (lower === '--network') {
      flags.network = true;
    } else if (lower === '--vpn') {
      flags.vpn = true;
    } else if (lower === '--geo') {
      flags.geo = true;
    } else if (lower === '--sources') {
      flags.sources = true;
    } else if (lower === '--json') {
      flags.json = true;
    } else {
      remainingArgs.push(arg);
    }
  }

  if (flags.verbose) {
    flags.threats = true;
    flags.network = true;
    flags.vpn = true;
    flags.geo = true;
    flags.sources = true;
  }

  return { flags, remainingArgs };
}

export function shouldShowSection(flags: ScanFlags, section: keyof Omit<ScanFlags, 'verbose' | 'json'>): boolean {
  if (flags.verbose || flags.json) return true;

  const hasAnyFlag = flags.threats || flags.network || flags.vpn || flags.geo || flags.sources;

  if (!hasAnyFlag) return true;

  return flags[section];
}
