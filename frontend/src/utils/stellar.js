const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;
const STRKEY_ED25519_PUBLIC_KEY = 6 << 3;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(value) {
  let bits = 0;
  let buffer = 0;
  const bytes = [];

  for (const char of value) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return bytes;
}

function crc16XModem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

export function isValidIssuerAddress(value) {
  const address = value.trim().toUpperCase();
  if (!STELLAR_PUBLIC_KEY_PATTERN.test(address)) return false;

  const decoded = decodeBase32(address);
  if (!decoded || decoded.length !== 35 || decoded[0] !== STRKEY_ED25519_PUBLIC_KEY) {
    return false;
  }

  const payload = decoded.slice(0, -2);
  const checksum = decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
  return crc16XModem(payload) === checksum;
}

export function normalizeIssuerAddress(value) {
  return value.trim().toUpperCase();
}
