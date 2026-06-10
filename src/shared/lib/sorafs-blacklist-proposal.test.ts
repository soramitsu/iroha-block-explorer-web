import { describe, expect, it } from 'vitest';
import {
  SORAFS_BLACKLIST_PROPOSAL_ISSUES,
  buildSorafsBlacklistImpactCommand,
  buildSorafsBlacklistProposalFilename,
  buildSorafsBlacklistProposal,
  buildSorafsBlacklistValidateCommand,
  parseProposalDuplicates,
  validateSorafsBlacklistProposalDraft,
} from './sorafs-blacklist-proposal';

const localizedText = {
  addTitle: 'Blacklist proposal for bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
  removeTitle: 'Denylist removal proposal for bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
  addMotivation:
    'Fraud review requested for manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 and its public SoraFS root CID bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi.',
  removeMotivation:
    'Review requested to remove manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 and its public SoraFS root CID bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi from the denylist.',
  addExpectedImpact:
    'If accepted, this proposal would add the selected root CID to the denylist so delivery can be restricted while the evidence is reviewed.',
  removeExpectedImpact:
    'If accepted, this proposal would remove the selected root CID from the denylist so delivery can resume on participating gateways.',
  addTargetReason:
    'Fraud moderation report for SoraFS CID bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
  removeTargetReason:
    'Request to remove SoraFS CID bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi from the denylist and restore delivery.',
  addCidEvidenceDescription:
    'Manifest CAR evidence for 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76.',
  removeCidEvidenceDescription:
    'Manifest CAR evidence for removal review of 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76.',
  addUrlEvidenceDescription:
    'Explorer evidence for manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
  removeUrlEvidenceDescription:
    'Removal review evidence for manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
} as const;

describe('sorafs blacklist proposal helpers', () => {
  it('builds an agenda proposal draft with sorafs and url evidence', () => {
    const draft = buildSorafsBlacklistProposal(
      {
        manifestDigestHex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
        aliasName: 'web.app',
        rootCid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
        rootCidHex: '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a',
        publicEvidenceUrl: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/',
        explorerEvidenceUrl: 'https://taira-explorer.sora.org/sorafs/registry#manifest-1',
        evidenceDigestBlake3Hex: '6f90754d74fe89ae79f2c0017655bc908eb7f98f249c3ba1dc5c0bd1d8861e58',
        timestampMs: 1770000000000,
      },
      {
        action: 'add-to-denylist',
        reasonTag: 'fraud',
        proposalId: 'AC-2026-241',
        submitterName: 'Alice Moderator',
        submitterContact: 'alice@example.com',
        submitterOrganization: 'Sora Ops',
        submitterPgpFingerprint: 'a2b3c4d5e6f70123456789abcdef0123456789ab',
        note: 'Customer report with reproduced payload.',
        duplicatesRaw: 'AC-2025-014, AC-2025-015',
      },
      {
        locale: 'en-US',
        localizedText,
      }
    );

    expect(draft.targets[0]).toMatchObject({
      label: 'web.app (bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi)',
      hash_family: 'sorafs-root-cid',
      hash_hex: '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a',
    });
    expect(draft.evidence).toEqual([
      {
        kind: 'sorafs-cid',
        uri: 'sorafs://bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/manifest.car',
        digest_blake3_hex: '6f90754d74fe89ae79f2c0017655bc908eb7f98f249c3ba1dc5c0bd1d8861e58',
        description: 'Manifest CAR evidence for 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76.',
      },
      {
        kind: 'url',
        uri: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/',
        description:
          'Explorer evidence for manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 · Customer report with reproduced payload.',
      },
    ]);
    expect(draft.summary.motivation).toBe(localizedText.addMotivation);
    expect(draft.targets[0]?.reason).toBe(
      `${localizedText.addTargetReason} · Customer report with reproduced payload.`
    );
    expect(draft.submitter.pgp_fingerprint).toBe('A2B3C4D5E6F70123456789ABCDEF0123456789AB');
    expect(draft.duplicates).toEqual(['AC-2025-014', 'AC-2025-015']);
    expect(draft.language).toBe('en-US');
  });

  it('deduplicates duplicate proposal references from mixed separators', () => {
    expect(parseProposalDuplicates('AC-2025-014,\nAC-2025-015\nAC-2025-014')).toEqual([
      'AC-2025-014',
      'AC-2025-015',
    ]);
  });

  it('builds deterministic export filenames and cli commands for the documented ministry workflow', () => {
    const filename = buildSorafsBlacklistProposalFilename(
      'AC-2026-241',
      'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi'
    );

    expect(filename).toBe(
      'agenda-proposal-AC-2026-241-bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi.json'
    );
    expect(buildSorafsBlacklistValidateCommand(filename)).toBe(
      `cargo xtask ministry-agenda validate --proposal ./${filename}`
    );
    expect(buildSorafsBlacklistImpactCommand(filename, 'AC-2026-241')).toBe(
      `cargo xtask ministry-agenda impact --proposal ./${filename} --out ./impact-AC-2026-241.json`
    );
  });

  it('reports malformed proposal fields and missing evidence surfaces', () => {
    expect(
      validateSorafsBlacklistProposalDraft(
        {
          manifestDigestHex: 'manifest-1',
          rootCid: 'bafk-test',
          rootCidHex: '',
          publicEvidenceUrl: null,
          explorerEvidenceUrl: null,
          evidenceDigestBlake3Hex: 'not-a-digest',
        },
        {
          action: 'add-to-denylist',
          reasonTag: 'spam',
          proposalId: 'bad-id',
          submitterName: '',
          submitterContact: '',
          submitterPgpFingerprint: '1234',
          duplicatesRaw: 'oops',
        }
      )
    ).toEqual([
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingRootCid,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidProposalId,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingSubmitterName,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingSubmitterContact,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidPgpFingerprint,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidEvidenceDigest,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingEvidence,
      SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidDuplicateReference,
    ]);
  });

  it('builds denylist removal drafts without enumerated reason tags', () => {
    const draft = buildSorafsBlacklistProposal(
      {
        manifestDigestHex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
        rootCid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
        rootCidHex: '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a',
        publicEvidenceUrl: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/',
        explorerEvidenceUrl: 'https://taira-explorer.sora.org/sorafs/registry#manifest-1',
        evidenceDigestBlake3Hex: '6f90754d74fe89ae79f2c0017655bc908eb7f98f249c3ba1dc5c0bd1d8861e58',
        timestampMs: 1770000000000,
      },
      {
        action: 'remove-from-denylist',
        proposalId: 'AC-2026-242',
        submitterName: 'Review Council',
        submitterContact: 'review@example.com',
        note: 'Appeal accepted after duplicate false positive review.',
        duplicatesRaw: 'AC-2026-111, review-42',
      },
      {
        locale: 'en-US',
        localizedText,
      }
    );

    expect(draft.action).toBe('remove-from-denylist');
    expect(draft.tags).toEqual([]);
    expect(draft.summary.title).toContain('Denylist removal proposal');
    expect(draft.summary.motivation).toBe(localizedText.removeMotivation);
    expect(draft.summary.expected_impact).toContain('remove the selected root CID from the denylist');
    expect(draft.targets[0]?.reason).toBe(
      `${localizedText.removeTargetReason} · Appeal accepted after duplicate false positive review.`
    );
  });

  it('normalizes valid locale tags and uses caller-localized payload text verbatim', () => {
    const frenchText = {
      addTitle: 'Proposition de liste noire pour bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
      removeTitle: 'Proposition de retrait de liste noire pour bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
      addMotivation:
        'Un examen pour fraude est demandé pour le manifeste 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 et son CID racine public SoraFS bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi.',
      removeMotivation:
        'Un examen est demandé pour retirer le manifeste 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 et son CID racine public SoraFS bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi de la liste noire.',
      addExpectedImpact:
        'Si elle est acceptée, cette proposition ajoutera le CID racine choisi à la liste noire afin de restreindre la diffusion pendant l’examen des preuves.',
      removeExpectedImpact:
        'Si elle est acceptée, cette proposition retirera le CID racine choisi de la liste noire afin que la diffusion reprenne sur les passerelles participantes.',
      addTargetReason:
        'Rapport de modération pour fraude sur le CID SoraFS bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
      removeTargetReason:
        'Demande de retrait du CID SoraFS bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi de la liste noire et de rétablissement de la diffusion.',
      addCidEvidenceDescription:
        'Preuve CAR du manifeste pour 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76.',
      removeCidEvidenceDescription:
        'Preuve CAR du manifeste pour l’examen de retrait de 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76.',
      addUrlEvidenceDescription:
        'Preuve de l’explorateur pour le manifeste 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
      removeUrlEvidenceDescription:
        'Preuve de l’examen de retrait pour le manifeste 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
    } as const;

    const draft = buildSorafsBlacklistProposal(
      {
        manifestDigestHex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
        aliasName: 'web.app',
        rootCid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
        rootCidHex: '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a',
        publicEvidenceUrl: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/',
        explorerEvidenceUrl: 'https://taira-explorer.sora.org/sorafs/registry#manifest-1',
        evidenceDigestBlake3Hex: '6f90754d74fe89ae79f2c0017655bc908eb7f98f249c3ba1dc5c0bd1d8861e58',
      },
      {
        action: 'add-to-denylist',
        reasonTag: 'fraud',
        proposalId: 'AC-2026-241',
        submitterName: 'Alice Moderator',
        submitterContact: 'alice@example.com',
      },
      {
        locale: 'fr-fr',
        localizedText: frenchText,
      }
    );

    expect(draft.language).toBe('fr-FR');
    expect(draft.summary.title).toBe(frenchText.addTitle);
    expect(draft.summary.motivation).toBe(frenchText.addMotivation);
    expect(draft.summary.expected_impact).toBe(frenchText.addExpectedImpact);
    expect(draft.evidence[0]?.description).toBe(frenchText.addCidEvidenceDescription);
    expect(draft.evidence[1]?.description).toBe(frenchText.addUrlEvidenceDescription);
  });

  it('falls back to en when the UI locale cannot be normalized to a BCP-47 tag', () => {
    const draft = buildSorafsBlacklistProposal(
      {
        manifestDigestHex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
        rootCid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
        rootCidHex: '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a',
        publicEvidenceUrl: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/',
        explorerEvidenceUrl: 'https://taira-explorer.sora.org/sorafs/registry#manifest-1',
        evidenceDigestBlake3Hex: '6f90754d74fe89ae79f2c0017655bc908eb7f98f249c3ba1dc5c0bd1d8861e58',
      },
      {
        action: 'add-to-denylist',
        reasonTag: 'fraud',
        proposalId: 'AC-2026-241',
        submitterName: 'Alice Moderator',
        submitterContact: 'alice@example.com',
        note: 'Customer report with reproduced payload.',
      },
      {
        locale: 'not a locale',
        localizedText,
      }
    );

    expect(draft.language).toBe('en');
  });

  it('requires a reviewer note for denylist removals', () => {
    expect(
      validateSorafsBlacklistProposalDraft(
        {
          manifestDigestHex: 'manifest-1',
          rootCid: 'bafk-test',
          rootCidHex: '11',
          publicEvidenceUrl: 'https://taira.sora.org/sorafs/cid/bafk-test/',
          explorerEvidenceUrl: null,
          evidenceDigestBlake3Hex: null,
        },
        {
          action: 'remove-from-denylist',
          proposalId: 'AC-2026-001',
          submitterName: 'Review Council',
          submitterContact: 'review@example.com',
          note: '',
        }
      )
    ).toEqual([SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingRemovalNote]);
  });
});
