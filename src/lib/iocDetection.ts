export type IOCType = 'ip' | 'url' | 'domain' | 'hash' | 'extension' | 'cve' | 'wallet' | 'email' | 'unknown';

export interface IOCDetectionResult {
  type: IOCType;
  value: string;
  normalizedValue: string;
}

const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const md5Regex = /^[a-fA-F0-9]{32}$/;
const sha1Regex = /^[a-fA-F0-9]{40}$/;
const sha256Regex = /^[a-fA-F0-9]{64}$/;
const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const chromeExtensionIdRegex = /^[a-z]{32}$/;
const cveRegex = /^CVE-\d{4}-\d{4,}$/i;
const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
// BTC: P2PKH (1...), P2SH (3...), bech32 (bc1...)
const btcAddressRegex = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[ac-hj-np-z02-9]{6,87}$/;
// ETH: 0x followed by 40 hex chars
const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

function normalizeInput(input: string): string {
  return input.trim().toLowerCase();
}

function isURL(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isIP(value: string): boolean {
  return ipv4Regex.test(value) || ipv6Regex.test(value);
}

function isHash(value: string): boolean {
  return md5Regex.test(value) || sha1Regex.test(value) || sha256Regex.test(value);
}

function isDomain(value: string): boolean {
  if (value.includes('://')) return false;
  if (isIP(value)) return false;
  return domainRegex.test(value);
}

function isChromeExtensionId(value: string): boolean {
  return chromeExtensionIdRegex.test(value);
}

function isCVE(value: string): boolean {
  return cveRegex.test(value);
}

function isEmail(value: string): boolean {
  return emailRegex.test(value);
}

function isWallet(value: string): boolean {
  return btcAddressRegex.test(value) || ethAddressRegex.test(value);
}

export function getWalletCurrency(address: string): 'btc' | 'eth' | 'unknown' {
  if (ethAddressRegex.test(address)) return 'eth';
  if (btcAddressRegex.test(address)) return 'btc';
  return 'unknown';
}

function extractChromeExtensionId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (
      (urlObj.hostname === 'chromewebstore.google.com' ||
       urlObj.hostname === 'chrome.google.com') &&
      urlObj.pathname.includes('/detail/')
    ) {
      const parts = urlObj.pathname.split('/');
      const detailIndex = parts.indexOf('detail');
      if (detailIndex !== -1 && parts.length > detailIndex + 1) {
        const possibleId = parts[detailIndex + 2] || parts[detailIndex + 1];
        if (possibleId && chromeExtensionIdRegex.test(possibleId)) {
          return possibleId;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function detectIOCType(input: string): IOCDetectionResult {
  const trimmed = input.trim();
  const normalized = normalizeInput(input);

  if (!trimmed) {
    return {
      type: 'unknown',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  const extensionId = extractChromeExtensionId(trimmed);
  if (extensionId) {
    return {
      type: 'extension',
      value: extensionId,
      normalizedValue: extensionId.toLowerCase(),
    };
  }

  if (isCVE(trimmed)) {
    return {
      type: 'cve',
      value: trimmed.toUpperCase(),
      normalizedValue: trimmed.toUpperCase(),
    };
  }

  if (isEmail(trimmed)) {
    return {
      type: 'email',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  if (isURL(trimmed)) {
    return {
      type: 'url',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  if (isIP(trimmed)) {
    return {
      type: 'ip',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  if (isHash(normalized)) {
    return {
      type: 'hash',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  if (isChromeExtensionId(normalized)) {
    return {
      type: 'extension',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  if (isWallet(trimmed)) {
    return {
      type: 'wallet',
      value: trimmed,
      normalizedValue: trimmed,
    };
  }

  if (isDomain(trimmed)) {
    return {
      type: 'domain',
      value: trimmed,
      normalizedValue: normalized,
    };
  }

  return {
    type: 'unknown',
    value: trimmed,
    normalizedValue: normalized,
  };
}

export function getHashType(hash: string): 'md5' | 'sha1' | 'sha256' | null {
  const normalized = normalizeInput(hash);
  if (md5Regex.test(normalized)) return 'md5';
  if (sha1Regex.test(normalized)) return 'sha1';
  if (sha256Regex.test(normalized)) return 'sha256';
  return null;
}
