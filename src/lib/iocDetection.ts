export type IOCType = 'ip' | 'url' | 'domain' | 'hash' | 'extension' | 'unknown';

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
