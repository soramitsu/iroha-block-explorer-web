// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const FONT_ROOT = resolve('src/shared/ui/fonts/ancient');
const ANCIENT_SOURCE_ROOT = resolve('src/shared/lib/localization/ancient');
const manifest = JSON.parse(readFileSync(resolve(FONT_ROOT, 'fonts.manifest.json'), 'utf8')) as {
  license: string;
  fonts: Record<
    'akk' | 'egy',
    {
      output: string;
      outputSha256: string;
      licenseFile: string;
      licenseSha256: string;
      subsetCodePoints: string[];
      sourceSha256: string;
      upstreamRevision: string;
      localeSource: string;
      localeSourceSha256: string;
    }
  >;
};

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value);
  else if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStrings(nested, output);
  }
  return output;
}

const WOFF2_KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
] as const;

interface Woff2TableEntry {
  readonly tag: string;
  readonly storedLength: number;
}

function readUIntBase128(bytes: Buffer, cursor: { offset: number }): number {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    if (cursor.offset >= bytes.length) throw new Error('truncated UIntBase128');
    const byte = bytes[cursor.offset];
    cursor.offset += 1;
    if (index === 0 && byte === 0x80) throw new Error('non-canonical UIntBase128');
    if (value > 0x01ff_ffff) throw new Error('UIntBase128 overflow');
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('UIntBase128 exceeds five bytes');
}

function readWoff2Tables(path: string): Map<string, Buffer> {
  const bytes = readFileSync(path);
  if (bytes.readUInt32BE(0) !== 0x774f_4632) throw new Error('not a WOFF2 font');
  if (bytes.readUInt32BE(8) !== bytes.length) throw new Error('WOFF2 length mismatch');
  if (bytes.readUInt16BE(14) !== 0) throw new Error('WOFF2 reserved field is non-zero');

  const tableCount = bytes.readUInt16BE(12);
  const compressedLength = bytes.readUInt32BE(20);
  const cursor = { offset: 48 };
  const entries: Woff2TableEntry[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    const flags = bytes[cursor.offset];
    cursor.offset += 1;
    const tagIndex = flags & 0x3f;
    const tag =
      tagIndex === 0x3f
        ? bytes.subarray(cursor.offset, (cursor.offset += 4)).toString('ascii')
        : WOFF2_KNOWN_TAGS[tagIndex];
    if (!tag) throw new Error(`invalid WOFF2 table tag index ${tagIndex}`);
    const originalLength = readUIntBase128(bytes, cursor);
    const transformVersion = flags >>> 6;
    const transformed = tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;
    const storedLength = transformed ? readUIntBase128(bytes, cursor) : originalLength;
    entries.push({ tag, storedLength });
  }

  const decompressed = brotliDecompressSync(bytes.subarray(cursor.offset, cursor.offset + compressedLength));
  const tables = new Map<string, Buffer>();
  let dataOffset = 0;
  for (const entry of entries) {
    const end = dataOffset + entry.storedLength;
    if (end > decompressed.length) throw new Error(`truncated WOFF2 table ${entry.tag}`);
    tables.set(entry.tag, decompressed.subarray(dataOffset, end));
    dataOffset = end;
  }
  if (dataOffset !== decompressed.length) throw new Error('unexpected trailing WOFF2 table data');
  return tables;
}

function cmapContainsCodePoint(cmap: Buffer, codePoint: number): boolean {
  if (cmap.readUInt16BE(0) !== 0) throw new Error('unsupported cmap version');
  const recordCount = cmap.readUInt16BE(2);
  for (let index = 0; index < recordCount; index += 1) {
    const subtableOffset = cmap.readUInt32BE(4 + index * 8 + 4);
    if (subtableOffset + 16 > cmap.length || cmap.readUInt16BE(subtableOffset) !== 12) continue;
    const groupCount = cmap.readUInt32BE(subtableOffset + 12);
    for (let group = 0; group < groupCount; group += 1) {
      const groupOffset = subtableOffset + 16 + group * 12;
      const start = cmap.readUInt32BE(groupOffset);
      const end = cmap.readUInt32BE(groupOffset + 4);
      if (codePoint < start || codePoint > end) continue;
      return cmap.readUInt32BE(groupOffset + 8) + codePoint - start !== 0;
    }
  }
  return false;
}

describe('ancient font artifacts', () => {
  it('matches the recorded immutable output and license hashes', () => {
    expect(manifest.license).toBe('SIL Open Font License 1.1');
    for (const font of Object.values(manifest.fonts)) {
      expect(font.upstreamRevision).toMatch(/^[0-9a-f]{40}$/u);
      expect(font.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(sha256(font.localeSource)).toBe(font.localeSourceSha256);
      expect(sha256(resolve(FONT_ROOT, font.output))).toBe(font.outputSha256);
      expect(sha256(resolve(FONT_ROOT, font.licenseFile))).toBe(font.licenseSha256);
    }
  });

  it('records every ancient-script code point used by each review manifest', () => {
    const ranges = { akk: [0x12000, 0x1254f], egy: [0x13000, 0x1345f] } as const;
    for (const locale of ['akk', 'egy'] as const) {
      const source = JSON.parse(readFileSync(resolve(ANCIENT_SOURCE_ROOT, `${locale}.source.json`), 'utf8')) as {
        records: Record<string, { ancientScript: string }>;
      };
      const recorded = new Set(manifest.fonts[locale].subsetCodePoints);
      for (const message of collectStrings(Object.values(source.records).map((record) => record.ancientScript))) {
        for (const character of message) {
          const point = character.codePointAt(0) as number;
          if (point < ranges[locale][0] || point > ranges[locale][1]) continue;
          expect(recorded, `locale=${locale} codepoint=U+${point.toString(16).toUpperCase()}`).toContain(
            `U+${point.toString(16).toUpperCase().padStart(4, '0')}`
          );
        }
      }
    }
  });

  it('maps every recorded ancient code point in the actual WOFF2 cmap', () => {
    for (const locale of ['akk', 'egy'] as const) {
      const font = manifest.fonts[locale];
      const tables = readWoff2Tables(resolve(FONT_ROOT, font.output));
      const cmap = tables.get('cmap');
      expect(cmap, `locale=${locale}`).toBeDefined();
      for (const encoded of font.subsetCodePoints) {
        const codePoint = Number.parseInt(encoded.slice(2), 16);
        expect(cmapContainsCodePoint(cmap as Buffer, codePoint), `locale=${locale} codepoint=${encoded}`).toBe(true);
      }
    }
  });

  it('retains the Egyptian OpenType tables required for quadrat shaping', () => {
    const tables = readWoff2Tables(resolve(FONT_ROOT, manifest.fonts.egy.output));
    for (const tag of ['GDEF', 'GPOS', 'GSUB']) {
      expect(tables.get(tag)?.length, `table=${tag}`).toBeGreaterThan(0);
    }
  });

  it('retains the basic Egyptian quadrat controls without Extended-A signs', () => {
    const egyptian = new Set(manifest.fonts.egy.subsetCodePoints);
    for (let point = 0x13430; point <= 0x1343f; point += 1) {
      expect(egyptian).toContain(`U+${point.toString(16).toUpperCase()}`);
    }
    expect([...egyptian].some((value) => Number.parseInt(value.slice(2), 16) >= 0x13460)).toBe(false);
  });

  it.each([
    ['akk', '𒀝𒅗𒁕'],
    ['egy', '𓆎𓅓𓏏'],
  ] as const)('covers every ancient sign in the %s language-picker autonym', (locale, autonym) => {
    const recorded = new Set(manifest.fonts[locale].subsetCodePoints);
    for (const character of autonym) {
      const point = character.codePointAt(0) as number;
      expect(recorded).toContain(`U+${point.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  });
});
