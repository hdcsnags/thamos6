// _shared/dns.ts — sender-domain authentication posture via DNS-over-HTTPS.
//
// Distinct from the message's own Authentication-Results: this asks "could this
// domain be spoofed at all?" by reading what the domain actually publishes
// (SPF / DMARC / MX). A spoofed From on a domain with no DMARC is trivially
// forgeable; p=reject means a real spoof would have bounced. Network lives here,
// not in the dependency-free parser.

export interface DomainAuth {
  domain: string;
  hasMx: boolean;
  mx: string[];
  hasSpf: boolean;
  spf: string | null;
  hasDmarc: boolean;
  dmarc: string | null;
  dmarcPolicy: "reject" | "quarantine" | "none" | null;
  /** true when the domain publishes no enforcing DMARC (no record or p=none) */
  spoofable: boolean;
  assessment: string;
}

const DOH = "https://cloudflare-dns.com/dns-query";

async function txtAnswers(name: string, type: "TXT" | "MX"): Promise<string[]> {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.Answer ?? []).map((a: { data?: string }) => (a.data ?? "").replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

export async function lookupDomainAuth(domain: string): Promise<DomainAuth | null> {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d || !d.includes(".")) return null;

  const [mx, txt, dmarcTxt] = await Promise.all([
    txtAnswers(d, "MX"),
    txtAnswers(d, "TXT"),
    txtAnswers(`_dmarc.${d}`, "TXT"),
  ]);

  const spf = txt.find((r) => /v=spf1/i.test(r)) ?? null;
  const dmarc = dmarcTxt.find((r) => /v=DMARC1/i.test(r)) ?? null;
  const policyMatch = dmarc?.match(/\bp=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null;
  const dmarcPolicy = (policyMatch as DomainAuth["dmarcPolicy"]) ?? null;
  const spoofable = !dmarc || dmarcPolicy === "none";

  let assessment: string;
  if (!dmarc) {
    assessment = `${d} publishes no DMARC record — the domain is trivially spoofable and a forged From would not be rejected by receivers.`;
  } else if (dmarcPolicy === "none") {
    assessment = `${d} publishes DMARC p=none (monitor only) — spoofing is reported but not blocked, so forged mail is still deliverable.`;
  } else if (dmarcPolicy === "quarantine") {
    assessment = `${d} enforces DMARC p=quarantine — a spoof of this domain would normally land in junk, not the inbox.`;
  } else if (dmarcPolicy === "reject") {
    assessment = `${d} enforces DMARC p=reject — a genuine spoof of this exact domain would have been rejected, so weigh display-name/lookalike impersonation over exact-domain spoofing.`;
  } else {
    assessment = `${d} publishes a DMARC record.`;
  }
  if (!spf) assessment += " No SPF record is published.";

  return {
    domain: d,
    hasMx: mx.length > 0,
    mx: mx.slice(0, 3),
    hasSpf: Boolean(spf),
    spf,
    hasDmarc: Boolean(dmarc),
    dmarc,
    dmarcPolicy,
    spoofable,
    assessment,
  };
}

/** Best-effort registrable domain of a From header / address. */
export function senderDomain(from: string): string | null {
  const addr = from.match(/<([^>]+)>/)?.[1] ?? from.match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? "";
  const domain = addr.split("@")[1]?.trim().toLowerCase().replace(/[>\s]+$/, "");
  return domain && domain.includes(".") ? domain : null;
}
