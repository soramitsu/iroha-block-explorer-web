import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = resolve(ROOT, 'src');
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/localized-copy-allowlist.json');
const STATIC_METADATA_PATHS = [resolve(ROOT, 'index.html'), resolve(ROOT, 'public/site.webmanifest')];

const UI_PROPERTY_PATTERN =
  /\b(?:ariaLabel|description|emptyText|errorLabel|helpText|label|loadingLabel|message|notFoundLabel|placeholder|retryLabel|title|tooltip)\s*:\s*(?<quote>['"`])(?<value>[^\r\n]*?)\k<quote>/gu;
const UI_CONSTANT_PATTERN =
  /\b(?:const|let)\s+[A-Z0-9_]*(?:DESCRIPTION|EMPTY_TEXT|ERROR|LABEL|MESSAGE|PLACEHOLDER|TITLE|TOOLTIP)[A-Z0-9_]*\s*=\s*(?<quote>['"`])(?<value>[^\r\n]*?)\k<quote>/gu;
const UI_ASSIGNMENT_PATTERN =
  /\b(?:ariaLabel|description|emptyText|errorLabel|helpText|label|loadingLabel|message|notFoundLabel|placeholder|retryLabel|textContent|title|tooltip)\s*=\s*(?<quote>['"`])(?<value>[^\r\n]*?)\k<quote>/gu;
const UI_CALL_PATTERN =
  /\b(?:addNotification|notify|pushNotification|setWarningText|showNotification)\s*\(\s*(?<quote>['"`])(?<value>[^\r\n]*?)\k<quote>/gu;
const UI_RETURN_PATTERN = /\breturn\s+(?<quote>['"`])(?<value>[^\r\n]*?)\k<quote>/gu;
const STATIC_ACCESSIBILITY_ATTRIBUTE_PATTERN =
  /(?:^|\s)(?:alt|aria-label|aria-placeholder|aria-roledescription|aria-valuetext|placeholder|title)\s*=\s*(?<quote>['"])(?<value>.*?)\k<quote>/gu;
const TEMPLATE_TAG_PATTERN = /<\/?template\b[^>]*>/gu;
const TEMPLATE_INTERPOLATION_PATTERN = /\{\{(?<expression>[\s\S]*?)\}\}/gu;
const TEMPLATE_LITERAL_PATTERN = /`(?<value>(?:\\.|[^`])*)`/gu;
const RAW_TEMPLATE_DIAGNOSTIC_PATTERN = /\b(?:[A-Za-z_$][\w$]*Resource\.error|problem|streamState)\.message\b/gu;

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

async function sourceFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await sourceFiles(path)));
    else if (/\.(?:ts|vue)$/u.test(entry.name) && !/\.(?:test|spec)\.ts$/u.test(entry.name)) output.push(path);
  }
  return output;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function scriptSource(path, source) {
  if (!path.endsWith('.vue')) return source;
  return [...source.matchAll(/<script\b[^>]*>(?<body>[\s\S]*?)<\/script>/gu)]
    .map((match) => match.groups?.body ?? '')
    .join('\n');
}

function maskTemplateMarkup(source) {
  const output = [...source];
  const mask = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (output[index] !== '\n') output[index] = ' ';
    }
  };

  for (let index = 0; index < source.length; ) {
    if (source.startsWith('<!--', index)) {
      const closing = source.indexOf('-->', index + 4);
      const end = closing === -1 ? source.length : closing + 3;
      mask(index, end);
      index = end;
      continue;
    }
    if (source.startsWith('{{', index)) {
      const closing = source.indexOf('}}', index + 2);
      const end = closing === -1 ? source.length : closing + 2;
      mask(index, end);
      index = end;
      continue;
    }
    if (source[index] === '<') {
      let quote = null;
      let cursor = index + 1;
      for (; cursor < source.length; cursor += 1) {
        const character = source[cursor];
        if (quote !== null) {
          if (character === quote && source[cursor - 1] !== '\\') quote = null;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          continue;
        }
        if (character === '>') {
          cursor += 1;
          break;
        }
      }
      mask(index, cursor);
      index = cursor;
      continue;
    }
    index += 1;
  }
  return output.join('');
}

function rootTemplateSource(source) {
  TEMPLATE_TAG_PATTERN.lastIndex = 0;
  let depth = 0;
  let bodyStart = null;
  for (const match of source.matchAll(TEMPLATE_TAG_PATTERN)) {
    const closing = match[0].startsWith('</');
    if (!closing) {
      depth += 1;
      if (depth === 1) bodyStart = match.index + match[0].length;
      continue;
    }
    if (depth === 1 && bodyStart !== null) {
      return {
        body: source.slice(bodyStart, match.index),
        offset: bodyStart,
      };
    }
    depth = Math.max(0, depth - 1);
  }
  return null;
}

function isMeaningfulTemplateCopy(value) {
  const withoutEntities = value.replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/giu, '');
  return /\p{L}/u.test(withoutEntities);
}

export function findingsForTemplate(file, source) {
  const template = rootTemplateSource(source);
  if (!template) return [];
  const findings = [];

  for (const match of template.body.matchAll(STATIC_ACCESSIBILITY_ATTRIBUTE_PATTERN)) {
    const value = match.groups?.value?.trim();
    if (!value || !isMeaningfulTemplateCopy(value)) continue;
    findings.push({
      file,
      line: lineNumber(source, template.offset + match.index),
      value,
    });
  }

  for (const interpolation of template.body.matchAll(TEMPLATE_INTERPOLATION_PATTERN)) {
    const expression = interpolation.groups?.expression ?? '';
    for (const diagnostic of expression.matchAll(RAW_TEMPLATE_DIAGNOSTIC_PATTERN)) {
      findings.push({
        file,
        line: lineNumber(source, template.offset + interpolation.index + diagnostic.index),
        value: diagnostic[0],
      });
    }
    for (const literal of expression.matchAll(TEMPLATE_LITERAL_PATTERN)) {
      const prefix = expression.slice(0, literal.index);
      if (/(?:\$t|\bt|\.t)\(\s*$/u.test(prefix)) continue;
      const value = literal.groups?.value?.trim();
      if (!value || !isMeaningfulTemplateCopy(value.replace(/\$\{[^}]+\}/gu, ''))) continue;
      findings.push({
        file,
        line: lineNumber(source, template.offset + interpolation.index + literal.index),
        value,
      });
    }
  }

  const visibleText = maskTemplateMarkup(template.body);
  let lineOffset = 0;
  for (const line of visibleText.split('\n')) {
    const value = line.trim().replace(/\s+/gu, ' ');
    if (value && isMeaningfulTemplateCopy(value)) {
      findings.push({
        file,
        line: lineNumber(source, template.offset + lineOffset),
        value,
      });
    }
    lineOffset += line.length + 1;
  }
  return findings;
}

function findingsForSource(file, source) {
  const findings = [];
  for (const pattern of [
    UI_PROPERTY_PATTERN,
    UI_CONSTANT_PATTERN,
    UI_ASSIGNMENT_PATTERN,
    UI_CALL_PATTERN,
    UI_RETURN_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const value = match.groups?.value?.trim();
      if (
        !value ||
        /^\d+(?:\.\d+)?$/u.test(value) ||
        !/\p{L}/u.test(value.replace(/\$\{[^}]+\}/gu, '')) ||
        /^\/[a-z0-9]/iu.test(value) ||
        /^[a-z][\w-]*(?:\.[\w-]+)+$/u.test(value) ||
        value.startsWith('$t(') ||
        value.startsWith('t(')
      )
        continue;
      findings.push({ file, line: lineNumber(source, match.index), value });
    }
  }
  return findings;
}

function findingsForStaticMetadata(file, source) {
  const findings = [];
  if (file === 'index.html') {
    for (const match of source.matchAll(/<title>(?<value>[^<]*)<\/title>/gu)) {
      const value = match.groups?.value?.trim();
      if (value && isMeaningfulTemplateCopy(value)) {
        findings.push({ file, line: lineNumber(source, match.index), value });
      }
    }
    for (const match of source.matchAll(
      /<meta\b[^>]*(?:name|property)="(?:description|keywords|og:title|og:description|og:image:alt)"[^>]*content="(?<value>[^"]*)"[^>]*>/gu
    )) {
      const value = match.groups?.value?.trim();
      if (value && isMeaningfulTemplateCopy(value)) {
        findings.push({ file, line: lineNumber(source, match.index), value });
      }
    }
  } else if (file === 'public/site.webmanifest') {
    const manifest = JSON.parse(source);
    if (typeof manifest.name === 'string' && isMeaningfulTemplateCopy(manifest.name)) {
      findings.push({ file, line: 1, value: manifest.name });
    }
    if (typeof manifest.short_name === 'string' && isMeaningfulTemplateCopy(manifest.short_name)) {
      findings.push({ file, line: 1, value: manifest.short_name });
    }
  }
  return findings;
}

function allowed(finding, allowlist) {
  return allowlist.some((entry) => {
    if (entry.file !== finding.file) return false;
    if (entry.value !== undefined) return entry.value === finding.value;
    if (entry.pattern !== undefined) return new RegExp(entry.pattern, 'u').test(finding.value);
    return false;
  });
}

export async function checkLocalizedCopy({ root = ROOT } = {}) {
  const allowlist = JSON.parse(await readFile(resolve(root, relative(ROOT, ALLOWLIST_PATH)), 'utf8'));
  const findings = [];
  for (const path of await sourceFiles(resolve(root, relative(ROOT, SOURCE_ROOT)))) {
    const file = toPosix(relative(root, path));
    const fullSource = await readFile(path, 'utf8');
    const source = scriptSource(path, fullSource);
    for (const finding of [
      ...findingsForSource(file, source),
      ...(path.endsWith('.vue') ? findingsForTemplate(file, fullSource) : []),
    ]) {
      if (!allowed(finding, allowlist)) findings.push(finding);
    }
  }
  for (const metadataPath of STATIC_METADATA_PATHS) {
    const path = resolve(root, relative(ROOT, metadataPath));
    const file = toPosix(relative(root, path));
    const source = await readFile(path, 'utf8');
    for (const finding of findingsForStaticMetadata(file, source)) {
      if (!allowed(finding, allowlist)) findings.push(finding);
    }
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const findings = await checkLocalizedCopy();
  if (findings.length) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: untranslated UI string: ${JSON.stringify(finding.value)}`);
    }
    process.exitCode = 1;
  }
}
