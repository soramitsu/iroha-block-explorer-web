import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANCIENT_SOURCE_ROOT = resolve(ROOT, 'src/shared/lib/localization/ancient');
const OUTPUT_ROOT = resolve(ROOT, 'src/shared/ui/fonts/ancient');
const MANIFEST_PATH = resolve(OUTPUT_ROOT, 'fonts.manifest.json');

const SOURCES = {
  akk: {
    family: 'Explorer Noto Sans Cuneiform',
    revision: 'ade3d1533e06b2b1462ffcde8e08b129627ca360',
    sourceUrl:
      'https://raw.githubusercontent.com/google/fonts/ade3d1533e06b2b1462ffcde8e08b129627ca360/ofl/notosanscuneiform/NotoSansCuneiform-Regular.ttf',
    sourceSha256: 'b4e0a892514fcb1beb081c8b652fb36689f77105491d1796c2c3f5a59b4524d2',
    licenseUrl:
      'https://raw.githubusercontent.com/google/fonts/ade3d1533e06b2b1462ffcde8e08b129627ca360/ofl/notosanscuneiform/OFL.txt',
    output: 'noto-sans-cuneiform-subset.woff2',
    licenseOutput: 'OFL-Noto-Sans-Cuneiform.txt',
    range: [0x12000, 0x1254f],
    extraCodePoints: [...'𒀝𒅗𒁕'].map((character) => character.codePointAt(0)),
  },
  egy: {
    family: 'Explorer Egyptian Text',
    revision: '26db93b42d2395287c551ef50be5c62e69427d97',
    sourceUrl:
      'https://raw.githubusercontent.com/microsoft/font-tools/26db93b42d2395287c551ef50be5c62e69427d97/EgyptianOpenType/font/eot.ttf',
    sourceSha256: '33aa615f2a44bea78392bd6cf2c1d94f61dae7ca54fc37287c564908191999e9',
    licenseUrl:
      'https://raw.githubusercontent.com/microsoft/font-tools/26db93b42d2395287c551ef50be5c62e69427d97/EgyptianOpenType/font/LICENSE.txt',
    output: 'egyptian-text-subset.woff2',
    licenseOutput: 'OFL-Egyptian-Text.txt',
    range: [0x13000, 0x1345f],
    extraCodePoints: [
      ...[...'𓆎𓅓𓏏'].map((character) => character.codePointAt(0)),
      ...Array.from({ length: 0x10 }, (_, index) => 0x13430 + index),
    ],
  },
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStrings(nested, output);
  }
  return output;
}

function subsetCodePoints(locale, catalog) {
  const source = SOURCES[locale];
  const points = new Set(source.extraCodePoints);
  for (const message of collectStrings(catalog)) {
    for (const character of message) {
      const point = character.codePointAt(0);
      if (point >= source.range[0] && point <= source.range[1]) points.add(point);
    }
  }
  return [...points].sort((left, right) => left - right);
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function runPython(python, args) {
  return new Promise((accept, reject) => {
    const child = spawn(python, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) accept();
      else reject(new Error(`font subset process failed (${signal ?? code})`));
    });
  });
}

function codePointList(points) {
  return points.map((point) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`);
}

export async function buildAncientFonts({ python = process.env.ANCIENT_FONT_PYTHON || 'python3' } = {}) {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'iroha-ancient-fonts-'));
  try {
    const manifest = {
      schemaVersion: 1,
      generatedBy: 'scripts/build-ancient-fonts.mjs',
      license: 'SIL Open Font License 1.1',
      fonts: {},
    };

    for (const locale of ['akk', 'egy']) {
      const source = SOURCES[locale];
      const localeSourcePath = resolve(ANCIENT_SOURCE_ROOT, `${locale}.source.json`);
      const localeSourceBytes = await readFile(localeSourcePath);
      const localeSource = JSON.parse(localeSourceBytes.toString('utf8'));
      const ancientMessages = Object.values(localeSource.records).map((record) => record.ancientScript);
      const points = subsetCodePoints(locale, ancientMessages);
      const sourceBytes = await download(source.sourceUrl);
      if (sha256(sourceBytes) !== source.sourceSha256) throw new Error(`${locale} source font hash mismatch`);
      const licenseBytes = await download(source.licenseUrl);
      const sourcePath = resolve(temporaryRoot, `${locale}.ttf`);
      const outputPath = resolve(OUTPUT_ROOT, source.output);
      await writeFile(sourcePath, sourceBytes);
      await runPython(python, [
        '-m',
        'fontTools.subset',
        sourcePath,
        `--output-file=${outputPath}`,
        '--flavor=woff2',
        `--unicodes=${codePointList(points).join(',')}`,
        '--layout-features=*',
        '--glyph-names',
        '--symbol-cmap',
        '--legacy-cmap',
        '--notdef-glyph',
        '--notdef-outline',
        '--recommended-glyphs',
        '--name-IDs=*',
        '--name-legacy',
        '--name-languages=*',
      ]);
      const outputBytes = await readFile(outputPath);
      await writeFile(resolve(OUTPUT_ROOT, source.licenseOutput), licenseBytes);
      manifest.fonts[locale] = {
        family: source.family,
        upstreamRevision: source.revision,
        sourceUrl: source.sourceUrl,
        sourceSha256: source.sourceSha256,
        localeSource: `src/shared/lib/localization/ancient/${locale}.source.json`,
        localeSourceSha256: sha256(localeSourceBytes),
        subsetCodePoints: codePointList(points),
        output: basename(outputPath),
        outputSha256: sha256(outputBytes),
        licenseUrl: source.licenseUrl,
        licenseFile: source.licenseOutput,
        licenseSha256: sha256(licenseBytes),
      };
    }

    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) await buildAncientFonts();
