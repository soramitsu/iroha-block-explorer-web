// @vitest-environment node

import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  AncientLocaleQualificationError,
  assessAncientManifest,
  auditAncientLocales,
  createAncientManifest,
  createAncientRuntimeCatalog,
  generateAncientLocales,
} from './generate-ancient-locales.mjs';

const ENGLISH_PATH = 'src/shared/lib/localization/en.json';
const RUNTIME_PATHS = ['src/shared/lib/localization/akk.json', 'src/shared/lib/localization/egy.json'] as const;
const EGYPTIAN_SOURCE_PATH = 'src/shared/lib/localization/ancient/egy.source.json';
const EGYPTIAN_FORMAT_CONTROL_PATTERN = /[\u{13430}-\u{1345F}]/u;
const EXPECTED_EGYPTIAN_LEXEMES = {
  dr: ['𓂧𓂋𓂡', 'to drive away; to repel; to remove', '180130', 'dr', 'to drive away; to repel; to remove'],
  'jni̯': ['𓏎𓈖', 'to bring; to fetch', '26870', 'jni̯', 'to bring; to fetch'],
  'jri̯': ['𓁹', 'to do; to make; to create', '28550', 'jri̯', 'to do; to make; to create'],
  'mꜣꜣ': ['𓌳𓁹𓄿𓄿', 'to see; to look', '66270', 'mꜣꜣ', 'to see; to look'],
  'mꜣꜥ': ['𓌳𓐙𓂝𓏛', 'just; correct; true', '66460', 'mꜣꜥ', 'just; correct; true'],
  'mꜣꜥ.t': ['𓌳𓐙𓂝𓏏𓏛', 'right order; truth', '66620', 'mꜣꜥ.t', 'right order; truth'],
  nn: ['𓂜𓈖', 'there is not', '84550', 'nn', 'Middle Egyptian negative word; there is not'],
  'pr-ḥḏ': ['𓉐𓌉', 'treasury', '60780', 'pr-ḥḏ', 'treasury'],
  rn: ['𓂋𓈖', 'name', '94700', 'rn', 'name'],
  rḫ: ['𓂋𓐍𓏛', 'to know; to learn', '95620', 'rḫ', 'to know; to learn'],
  stp: ['𓋴𓏏𓊪𓍉𓏛', 'to pick out; to choose', '148070', 'stp', 'to pick out; to choose'],
  tꜣ: ['𓇾', 'earth; land; ground', '168860', 'tꜣ', 'earth; land; ground'],
  'wpw.tj': ['𓄋𓅱𓏏𓏭𓂻𓀀', 'messenger', '45760', 'wpw.tj', 'messenger'],
  'wḏ.w': ['𓎗𓅱𓏛', 'command; decree', '51980', 'wḏ.w', 'command; decree'],
  wḥm: ['𓄙𓅓', 'to repeat', '48440', 'wḥm', 'to repeat'],
  'zẖꜣ.w': ['𓏞𓏛', 'writing; record; depiction', '450097', 'zẖꜣ.w', 'writing; record; depiction'],
  ḥsb: ['𓎛𓋴𓃀𓏴𓏛', 'count; reckon; distribute', '109870', 'ḥsb', 'to count; to reckon; to distribute'],
  ḫtm: ['𓐍𓏏𓅓𓋩', 'seal; sealing; sealing cylinder', '121690', 'ḫtm', 'seal; sealing; sealing cylinder'],
} as const;

async function readEnglish(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(ENGLISH_PATH, 'utf8')) as Record<string, unknown>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function approveTinyManifest(manifest: any): void {
  manifest.sourceStatus = 'project-reviewed';
  for (const record of Object.values<any>(manifest.records)) {
    for (const citation of record.citedEvidence) {
      citation.verification = {
        status: 'project-verified',
        reviewer: 'Amina Ionescu',
        notes: 'Checked against the cited edition.',
      };
    }
    record.review.semanticForwardPass = {
      status: 'project-approved',
      reviewer: 'Basil Mensah',
      notes: 'Meaning checked in UI context.',
    };
    record.review.blindBackTranslationPass = {
      status: 'project-approved',
      reviewer: 'Cyra Okafor',
      backTranslation: record.literalBackTranslation,
      notes: 'Translated from the blinded ancient-script candidate.',
    };
    if (record.review.protectedLiteralPass.status === 'pending') {
      record.review.protectedLiteralPass = {
        status: 'project-approved',
        reviewer: 'Dalia Rahman',
        notes: 'Every protected token is byte-exact.',
      };
    }
  }
}

describe('ancient locale qualification', () => {
  it('reports the exact scholarly work still required for both complete schema-v2 seeds', async () => {
    const reports = await auditAncientLocales();

    expect(reports).toHaveLength(2);
    for (const report of reports) {
      expect(report).toMatchObject({
        qualified: false,
        expectedRecordCount: 2_280,
        actualRecordCount: 2_280,
        blockerCounts: {
          blindBackTranslationPending: 2_280,
          evidenceVerificationPending: 2_248,
          manifestReviewPending: 1,
          protectedLiteralPending: 486,
          semanticForwardPending: 2_280,
        },
      });
      const expectedBlockers = [
        'blindBackTranslationPending',
        'evidenceVerificationPending',
        'manifestReviewPending',
        'protectedLiteralPending',
        'semanticForwardPending',
      ];
      expect(Object.keys(report.blockerCounts).sort()).toEqual(expectedBlockers.sort());
    }
  });

  it('never writes a runtime catalog while either manifest is unqualified', async () => {
    expect(await Promise.all(RUNTIME_PATHS.map(pathExists))).toEqual([false, false]);

    await expect(generateAncientLocales()).rejects.toBeInstanceOf(AncientLocaleQualificationError);
    await expect(generateAncientLocales({ check: true })).rejects.toBeInstanceOf(AncientLocaleQualificationError);

    expect(await Promise.all(RUNTIME_PATHS.map(pathExists))).toEqual([false, false]);
  });

  it('requires an explicit review-reset acknowledgement before destructive seeding', async () => {
    await expect(generateAncientLocales({ seedManifests: true })).rejects.toThrow(
      '--seed-manifests requires --reset-reviews'
    );
    await expect(generateAncientLocales({ seedManifests: true, resetReviews: true, check: true })).rejects.toThrow(
      '--seed-manifests and --check are mutually exclusive'
    );
  });

  it.each(['akk', 'egy'] as const)(
    'creates a structurally complete but entirely unapproved %s review seed',
    async (locale) => {
      const english = await readEnglish();
      const manifest = createAncientManifest(locale, english);
      const report = assessAncientManifest(locale, manifest, english);

      expect(manifest.schemaVersion).toBe(2);
      expect(manifest.sourceStatus).toBe('unreviewed-draft');
      expect(Object.values(manifest.records)).toHaveLength(2_280);
      expect(report.blockerCounts).not.toHaveProperty('missingRecord');
      expect(report.blockerCounts).not.toHaveProperty('extraRecord');
      expect(report.blockerCounts).not.toHaveProperty('placeholderParity');
      expect(report.blockerCounts).not.toHaveProperty('protectedTokenParity');
      expect(report.blockerCounts).not.toHaveProperty('unexpectedRuntimeScript');
      expect(() => createAncientRuntimeCatalog(locale, manifest, english)).toThrow(AncientLocaleQualificationError);

      for (const record of Object.values(manifest.records)) {
        expect(record.review.semanticForwardPass).toEqual({
          status: 'pending',
          reviewer: null,
          notes: null,
        });
        expect(record.review.blindBackTranslationPass).toEqual({
          status: 'pending',
          reviewer: null,
          backTranslation: null,
          notes: null,
        });
        expect(record.review.protectedLiteralPass.status).not.toBe('project-approved');
        expect(record.citedEvidence.every((citation) => citation.verification.status === 'pending')).toBe(true);
      }
    }
  );

  it.each(['akk', 'egy'] as const)(
    'preserves brace and Blockly socket placeholders exactly in the %s seed',
    async (locale) => {
      const english = await readEnglish();
      const manifest = createAncientManifest(locale, english);

      expect(manifest.records['widgets.transactionCount'].ancientScript).toContain('{count}');
      expect(manifest.records['studio.blockly.blocks.state'].ancientScript).toContain('%1');
      expect(manifest.records['studio.blockly.blocks.state'].ancientScript).toContain('%2');
      expect(manifest.records['studio.blockly.blocks.state'].ancientScript).toContain('%3');
      expect(assessAncientManifest(locale, manifest, english).blockerCounts).not.toHaveProperty('placeholderParity');
    }
  );

  it('seeds only TLA-located Egyptian lexical constituents while leaving every complete formula reconstructed', async () => {
    const english = await readEnglish();
    const generatedManifest = createAncientManifest('egy', english);
    const checkedInManifest = JSON.parse(await readFile(EGYPTIAN_SOURCE_PATH, 'utf8'));

    for (const manifest of [generatedManifest, checkedInManifest]) {
      const records = Object.values<any>(manifest.records);
      const candidates = records.flatMap((record) => record.candidateConstituents);
      const definitions = new Map<string, Set<string>>();
      const uniqueCandidates = new Map<string, any>();
      for (const candidate of candidates) {
        const definition = JSON.stringify({
          script: candidate.script,
          transliteration: candidate.transliteration,
          meaning: candidate.meaning,
          constructionStatus: candidate.constructionStatus,
          classifierSemanticContribution: candidate.classifierSemanticContribution,
          lexicalEvidence: candidate.lexicalEvidence,
        });
        const knownDefinitions = definitions.get(candidate.transliteration) ?? new Set<string>();
        knownDefinitions.add(definition);
        definitions.set(candidate.transliteration, knownDefinitions);
        uniqueCandidates.set(candidate.transliteration, candidate);
      }

      expect(uniqueCandidates).toHaveProperty('size', 18);
      expect([...definitions.values()].every((entries) => entries.size === 1)).toBe(true);
      expect(
        Object.fromEntries(
          [...uniqueCandidates].map(([transliteration, candidate]) => {
            const evidence = candidate.lexicalEvidence[0];
            return [
              transliteration,
              [candidate.script, candidate.meaning, evidence.lemmaId, evidence.lemma, evidence.support],
            ];
          })
        )
      ).toEqual(EXPECTED_EGYPTIAN_LEXEMES);
      expect(records.every((record) => !EGYPTIAN_FORMAT_CONTROL_PATTERN.test(record.ancientScript))).toBe(true);
      expect(candidates.every((candidate) => !EGYPTIAN_FORMAT_CONTROL_PATTERN.test(candidate.script))).toBe(true);
      expect(candidates.every((candidate) => candidate.constructionStatus === 'attested-lexeme')).toBe(true);

      for (const candidate of candidates) {
        expect(candidate.lexicalEvidence).toHaveLength(1);
        for (const evidence of candidate.lexicalEvidence) {
          expect(evidence.url).toBe(`https://thesaurus-linguae-aegyptiae.de/lemma/${evidence.lemmaId}`);
        }
      }
      for (const record of records.filter((candidate) => candidate.candidateConstituents.length > 0)) {
        expect(record.attestationTier).toBe('poetic reconstruction');
        expect(record.constructionMode).toBe('modern-paratactic-interface-sequence');
        expect(record.constructionRationale).toContain('makes no Classical Egyptian phrase');
        expect(
          record.citedEvidence
            .filter((citation) => citation.evidenceRole === 'lexical-constituent')
            .every((citation) =>
              /TLA Lemma ID \w+\): https:\/\/thesaurus-linguae-aegyptiae\.de\/lemma\//u.test(citation.locator)
            )
        ).toBe(true);
        expect(record.citedEvidence.some((citation) => citation.evidenceRole === 'grammar-construction')).toBe(false);
      }
    }

    const report = assessAncientManifest('egy', generatedManifest, english);
    expect(report.blockerCounts).not.toHaveProperty('evidenceLocator');
    expect(report.blockerCounts).not.toHaveProperty('constructionEvidenceCoverage');
    expect(report.blockerCounts).not.toHaveProperty('egyptianConstituentMetadata');
    expect(report.blockerCounts.evidenceVerificationPending).toBe(2_248);
  });

  it('limits Old Akkadian seeds to page-located Sargonic lexemes and labels every UI formula as reconstructed', async () => {
    const english = await readEnglish();
    const manifest = createAncientManifest('akk', english);
    const records = Object.values<any>(manifest.records).filter(
      (record) => record.candidateConstituents.length > 0
    );
    const candidates = records.flatMap((record) => record.candidateConstituents);
    const uniqueTransliterations = [...new Set(candidates.map((candidate) => candidate.transliteration))].sort();

    expect(uniqueTransliterations).toEqual(
      [
        'amārum',
        'apāšum',
        'awātum',
        'biʾārum',
        'bītum',
        'kanākum',
        'kīnum',
        'mātum',
        'nasāḫum',
        'šiprum',
        'šumum',
        'ṭuppum',
        'ulā',
        'wabālum',
      ].sort()
    );

    for (const record of records) {
      expect(record.attestationTier).toBe('poetic reconstruction');
      expect(record.constructionRationale).toContain('modern paratactic UI reconstruction');
      expect(record.scholarlyTransliteration).not.toMatch(
        /(?:IGI DUB|DUB (?:DU|SAR)|NÍG\.GA|NU DUB|ku-nu-kum|ṭuppum ša|awat )/u
      );
      expect(
        record.citedEvidence
          .filter((citation) => citation.evidenceRole === 'lexical-constituent')
          .every((citation) => /^MAD3 pp?\. \d/u.test(citation.locator))
      ).toBe(true);
      expect(
        record.citedEvidence.find((citation) => citation.evidenceRole === 'grammar-construction')?.locator
      ).toBe(
        'MAD2 p. 169, §c “Infinitive”; pp. 145–146, §2 “Construct State”; pp. 218–235, “Sign List”'
      );
    }

    for (const candidate of candidates) {
      expect(candidate.constructionStatus).toBe('attested-lexeme');
      expect([
        'attested-exceptional-syllabic-spelling',
        'attested-logogram',
        'reconstructed-normalized-syllabic-citation',
      ]).toContain(candidate.scriptRendering);
      expect(candidate.lexicalEvidence).toHaveLength(1);
      expect(candidate.lexicalEvidence[0].sourceId).toBe('MAD3');
    }

    expect(candidates.find((candidate) => candidate.transliteration === 'šiprum')).toMatchObject({
      script: '𒋛𒅁𒊒𒌝',
      scriptRendering: 'reconstructed-normalized-syllabic-citation',
    });
    expect(candidates.find((candidate) => candidate.transliteration === 'kīnum')).toMatchObject({
      script: '𒁴',
      scriptRendering: 'attested-logogram',
    });
    expect(candidates.find((candidate) => candidate.transliteration === 'ulā')).toMatchObject({
      script: '𒌋𒆷',
      scriptRendering: 'attested-exceptional-syllabic-spelling',
    });
    expect(
      candidates.find((candidate) => candidate.transliteration === 'ulā').lexicalEvidence[0].support
    ).toContain('normal ù-la and one exceptional u-la');

    const report = assessAncientManifest('akk', manifest, english);
    expect(report.blockerCounts).not.toHaveProperty('evidenceLocator');
    expect(report.blockerCounts).not.toHaveProperty('akkadianConstituentMetadata');
    expect(report.blockerCounts.evidenceVerificationPending).toBe(2_248);
  });

  it('rejects classifier picture-word credit and quadrat claims without Egyptian format controls', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('egy', english);
    const record = manifest.records.sample;

    expect(record.ancientScript).not.toMatch(/[\u{13430}-\u{1345F}]/u);
    expect(record.encodingAssessment).toEqual({
      formatControlsPresent: false,
      quadratClaim: 'none',
      classifierPolicy: 'classifiers-constrain-lexical-reading-only',
    });
    expect(record.candidateConstituents.every((candidate) => candidate.classifierSemanticContribution === 'none')).toBe(
      true
    );
    expect(record.candidateConstituents.map((candidate) => candidate.meaning).join(' ')).not.toMatch(
      /archive|on record|ordered territory|sealed thing|written command/iu
    );

    record.candidateConstituents[0].classifierSemanticContribution = 'record';
    record.encodingAssessment.quadratClaim = 'quadrat-correct';
    const report = assessAncientManifest('egy', manifest, english);

    expect(report.blockerCounts.classifierPictureWordSemantics).toBe(1);
    expect(report.blockerCounts.quadratClaimWithoutFormatControls).toBe(1);
  });

  it('rejects Egyptian format controls even when encoding metadata mirrors the runtime text', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('egy', english);
    approveTinyManifest(manifest);
    const record = manifest.records.sample;
    record.ancientScript += '\u{13430}';
    record.encodingAssessment = {
      formatControlsPresent: true,
      quadratClaim: 'pending-render-review',
      classifierPolicy: 'classifiers-constrain-lexical-reading-only',
    };

    const report = assessAncientManifest('egy', manifest, english);
    expect(report.blockerCounts.egyptianFormatControlsUnsupported).toBe(1);
    expect(report.blockerCounts.unexpectedRuntimeScript).toBe(1);
    expect(report.qualified).toBe(false);
  });

  it('rejects an arbitrary Egyptian glyph substituted for the constituent composition', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('egy', english);
    approveTinyManifest(manifest);
    manifest.records.sample.ancientScript = '𓀀';

    const report = assessAncientManifest('egy', manifest, english);
    expect(report.blockerCounts.constituentComposition).toBe(1);
    expect(report.qualified).toBe(false);
  });

  it('rejects a self-consistent constituent that is outside the finite Egyptian inventory', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('egy', english);
    approveTinyManifest(manifest);
    const record = manifest.records.sample;
    const candidate = record.candidateConstituents[0];
    record.ancientScript = record.ancientScript.replace(candidate.script, '𓀀');
    candidate.script = '𓀀';

    const report = assessAncientManifest('egy', manifest, english);
    expect(report.blockerCounts.constituentInventory).toBe(1);
    expect(report.blockerCounts).not.toHaveProperty('constituentComposition');
    expect(report.qualified).toBe(false);
  });

  it('keeps lexical evidence isolated across records and manifest generations', () => {
    const english = { first: 'Inspect the record', second: 'Inspect the record' };
    const manifest = createAncientManifest('egy', english);
    const originalSupport = manifest.records.second.candidateConstituents[0].lexicalEvidence[0].support;

    manifest.records.first.candidateConstituents[0].lexicalEvidence[0].support = 'mutated evidence';

    expect(manifest.records.second.candidateConstituents[0].lexicalEvidence[0].support).toBe(originalSupport);
    expect(createAncientManifest('egy', english).records.first.candidateConstituents[0].lexicalEvidence[0].support).toBe(
      originalSupport
    );
  });

  it.each(['akk', 'egy'] as const)(
    'preserves the canonical contract-address placeholder byte-exactly in the %s seed',
    async (locale) => {
      const english = await readEnglish();
      const manifest = createAncientManifest(locale, english);
      const record = manifest.records['contracts.filters.contractAddressPlaceholder'];
      const aliasRecord = manifest.records['contracts.filters.contractAliasPlaceholder'];

      expect(record.ancientScript).toBe('irohac1…');
      expect(record.candidateConstituents).toEqual([]);
      expect(record.citedEvidence).toEqual([]);
      expect(record.review.protectedLiteralPass.status).toBe('pending');
      const report = assessAncientManifest(locale, manifest, english);
      expect(report.blockerCounts).not.toHaveProperty('protectedLiteralExactness');
      expect(report.blockerCounts).not.toHaveProperty('protectedLiteralConstituents');
      expect(report.blockerCounts).not.toHaveProperty('protectedLiteralEvidence');
      expect(aliasRecord.ancientScript).toBe('router::universal');
      expect(aliasRecord.candidateConstituents).toEqual([]);
      expect(aliasRecord.citedEvidence).toEqual([]);
    }
  );

  it.each(['akk', 'egy'] as const)(
    'preserves the Soracles and DeFi product names byte-exactly in the %s seed',
    async (locale) => {
      const english = await readEnglish();
      const manifest = createAncientManifest(locale, english);

      expect(manifest.records['soracles.nav'].ancientScript).toBe('Soracles');
      expect(manifest.records['soracles.title'].ancientScript).toBe('Soracles');
      expect(manifest.records['soracles.description'].ancientScript).toContain('DeFi');
      expect(manifest.records['soracles.loadError'].ancientScript).toContain('Soracles');
      expect(assessAncientManifest(locale, manifest, english).blockerCounts).not.toHaveProperty(
        'protectedLiteralExactness'
      );
    }
  );

  it.each(['akk', 'egy'] as const)('materializes a %s runtime only after all independent gates pass', (locale) => {
    const english = { sample: 'Inspect Torii value {value}' };
    const manifest = createAncientManifest(locale, english);
    approveTinyManifest(manifest);

    expect(assessAncientManifest(locale, manifest, english)).toMatchObject({
      qualified: true,
      expectedRecordCount: 1,
      actualRecordCount: 1,
      blockerCounts: {},
    });
    expect(createAncientRuntimeCatalog(locale, manifest, english)).toEqual({
      sample: manifest.records.sample.ancientScript,
    });
  });

  it('rejects placeholder reviewers, non-substantive notes, and reviewers equal after trimming', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('akk', english);
    approveTinyManifest(manifest);
    const record = manifest.records.sample;
    record.review.semanticForwardPass.reviewer = ' Reviewer ';
    record.review.semanticForwardPass.notes = 'approved';
    record.review.blindBackTranslationPass.reviewer = 'Reviewer';
    record.citedEvidence[0].verification.notes = 'verified';

    const report = assessAncientManifest('akk', manifest, english);
    expect(report.blockerCounts.semanticForwardReviewer).toBe(1);
    expect(report.blockerCounts.semanticForwardNotes).toBe(1);
    expect(report.blockerCounts.reviewerIndependence).toBe(1);
    expect(report.blockerCounts.evidenceVerificationPending).toBe(1);
  });

  it('treats reviewer identities as equal after Unicode, whitespace, and case normalization', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('akk', english);
    approveTinyManifest(manifest);
    manifest.records.sample.review.semanticForwardPass.reviewer = 'Alice  Scholar';
    manifest.records.sample.review.blindBackTranslationPass.reviewer = ' alice scholar ';

    expect(assessAncientManifest('akk', manifest, english).blockerCounts.reviewerIndependence).toBe(1);
  });

  it('rejects generic role labels in place of named human reviewers', () => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest('akk', english);
    approveTinyManifest(manifest);
    const record = manifest.records.sample;
    record.review.semanticForwardPass.reviewer = 'Forward Reviewer';
    record.review.blindBackTranslationPass.reviewer = 'Blind Reviewer';
    record.citedEvidence[0].verification.reviewer = 'Evidence Reviewer';

    const report = assessAncientManifest('akk', manifest, english);
    expect(report.blockerCounts.semanticForwardReviewer).toBe(1);
    expect(report.blockerCounts.blindBackTranslationReviewer).toBe(1);
    expect(report.blockerCounts.evidenceVerificationPending).toBe(1);
  });

  it.each([
    ['akk', 'CAD'],
    ['egy', 'UNICODE17-11'],
  ] as const)('rejects %s lexical evidence sourced only from %s', (locale, invalidSource) => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest(locale, english);
    approveTinyManifest(manifest);
    for (const citation of manifest.records.sample.citedEvidence) {
      if (citation.evidenceRole === 'lexical-constituent') citation.sourceId = invalidSource;
    }

    expect(assessAncientManifest(locale, manifest, english).blockerCounts.evidenceShape).toBe(1);
  });

  it.each(['akk', 'egy'] as const)('rejects %s citations that drift from their lexical constituent', (locale) => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest(locale, english);
    approveTinyManifest(manifest);
    const citation = manifest.records.sample.citedEvidence.find(
      (candidate) => candidate.evidenceRole === 'lexical-constituent'
    );
    citation.locator += ' altered';

    const report = assessAncientManifest(locale, manifest, english);
    expect(report.blockerCounts.lexicalEvidenceCoherence).toBe(1);
    expect(report.qualified).toBe(false);
  });

  it.each([
    ['akk', 'MAD3'],
    ['egy', 'TLA-CORPUS'],
  ] as const)('never promotes a modern %s paratactic sequence to attested', (locale, sourceId) => {
    const english = { sample: 'Inspect the record' };
    const manifest = createAncientManifest(locale, english);
    approveTinyManifest(manifest);
    const record = manifest.records.sample;
    record.attestationTier = 'attested';
    const missingCorpusReport = assessAncientManifest(locale, manifest, english);
    expect(missingCorpusReport.blockerCounts.attestationEvidenceCoverage).toBe(1);
    expect(missingCorpusReport.blockerCounts.attestationTierForConstruction).toBe(1);

    record.citedEvidence.push({
      sourceId,
      evidenceRole: 'corpus-attestation',
      locator: `${sourceId} exact period text 42, line 3`,
      support: 'The complete expression is attested in the cited period text.',
      verification: {
        status: 'project-verified',
        reviewer: 'Eleni Papadakis',
        notes: 'Checked the complete expression against the cited period text.',
      },
    });
    const report = assessAncientManifest(locale, manifest, english);
    expect(report.blockerCounts).not.toHaveProperty('attestationEvidenceCoverage');
    expect(report.blockerCounts.attestationTierForConstruction).toBe(1);
    expect(report.qualified).toBe(false);
  });

  it.each(['akk', 'egy'] as const)('rejects emoji and bidi controls from %s runtime text', (locale) => {
    const english = { emoji: 'Inspect the record', bidi: 'Open the record' };
    const manifest = createAncientManifest(locale, english);
    manifest.records.emoji.ancientScript += '🙂';
    manifest.records.bidi.ancientScript += '\u202e';

    expect(assessAncientManifest(locale, manifest, english).blockerCounts.unexpectedRuntimeScript).toBe(2);
  });

  it.each(['akk', 'egy'] as const)(
    'detects missing Blockly sockets, protected tokens, and foreign runtime prose in %s',
    (locale) => {
      const english = {
        sample: {
          socket: 'state %1 as %2',
          protocol: 'Inspect Torii API value {value}',
        },
      };
      const manifest = createAncientManifest(locale, english);
      manifest.records['sample.socket'].ancientScript = manifest.records['sample.socket'].ancientScript.replace(
        '%2',
        ''
      );
      manifest.records['sample.protocol'].ancientScript = `${manifest.records['sample.protocol'].ancientScript.replace(
        'Torii',
        ''
      )} bogus`;

      const report = assessAncientManifest(locale, manifest, english);
      expect(report.blockerCounts.placeholderParity).toBe(1);
      expect(report.blockerCounts.protectedTokenParity).toBe(2);
      expect(report.blockerCounts.unexpectedRuntimeScript).toBe(1);
    }
  );
});
