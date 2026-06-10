import { createI18n } from 'vue-i18n';
import en from './en.json';

type LocaleMessages = typeof en;

// Historic poetic locales are still programmatic so we can keep their custom typography.
const akk: LocaleMessages = JSON.parse(JSON.stringify(en));
const egy: LocaleMessages = JSON.parse(JSON.stringify(en));

akk.search = '𒅆𒄿 (seek the hidden trace)';
akk.noData = '𒁾 𒋫 𒈠 (the tablet is silent)';
akk.viewAll = '𒀀𒁺 (behold all)';
akk.searchUnsupported = '𒅆 𒀀 𒋗 (this omen has no reading)';
akk.domain = '𒆠 (land-domain)';
akk.pageNotFound = '𒁾 𒄿 𒇷 (tablet not found)';
akk.none = '𒇻 (none)';
akk.total = '𒁹𒌋 (whole sum)';
akk.widgets = {
  ...en.widgets,
  latestTransactions: '𒄿𒋼𒁕 𒌅𒉌 (fresh deeds)',
  latestBlocks: '𒆳 𒁾 𒄿𒀀 (new sealed tablets)',
};
akk.table = {
  ...en.table,
  rowsPerPage: '𒁾 𒉌 𒍣 (rows per tablet)',
  pageOf: '{0}-{1} 𒅗 {2}',
};
akk.homePage = {
  ...en.homePage,
  totalAccounts: '𒂍𒇽 (houses of names)',
  totalAssets: '𒉈𒀀 (stored wealth)',
  totalDomains: '𒆠𒈠 (bounded lands)',
  totalBlocks: '𒆳𒁾 (sealed blocks)',
  totalTransactions: '𒄿𒋼𒁕 (recorded deeds)',
  totalNodes: '𒇷𒂍 (watching towers)',
  searchPlaceholder:
    '𒅆 by block height/hash, transaction hash, I105/sora/norito account, asset#domain, or nft$domain',
  title: {
    firstLine: '𒀭𒈹 Iroha',
    secondLine: '𒁾𒈾 𒌦𒆠 (chain-tablet explorer)',
  },
  search: {
    ...en.homePage.search,
    placeholder:
      '𒅆 by block height/hash, transaction hash, I105/sora/norito account, account alias, asset Base58 id/alias, or nft$domain',
    hintTitle: '𒈨𒌍 (read these signs)',
    samples: {
      block: '𒆳 Block 12345',
      tx: '𒁾 Tx 0xabc123…',
      account: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
      asset: 'usd#issuer.main',
      nft: 'cool-cat$gallery',
      rwa: '01234567…$commodities',
    },
  },
};
akk.blocks = {
  ...en.blocks,
  blocks: '𒆳𒁾 (Blocks)',
  block: '𒆳 #{0}',
  blockTransactions: '𒄿𒋼𒁕 (block deeds)',
};
akk.assets = { ...en.assets, assets: '𒉈 (Assets)', assetsAndNFT: '𒉈 + NFT' };
akk.domains = { ...en.domains, domains: '𒆠 (Domains)' };
akk.accounts = { ...en.accounts, accounts: '𒂍𒇽 (Accounts)' };
akk.transactions = {
  ...en.transactions,
  transactions: '𒄿𒋼𒁕 (Transactions)',
  instructions: '𒁾𒋗 (Instructions)',
  custom: '𒋗-𒀀𒉡 (other crafted sign)',
  multisig: '𒈨𒌍𒋗 (many-seal decree)',
  committed: '𒆗 (sealed)',
  rejected: '𒄑𒉌 (cast away)',
  transactionDetails: '𒁾 deed details',
  instructionDetails: '𒋗 sign details',
  viewInstruction: '𒅆 open sign',
  hideInstruction: '𒌑 hide sign',
  retryInstruction: '𒁉 read again',
  copyInstructionLink: '𒁾 copy omen-link',
  instructionLinkCopied: '𒁾 omen-link copied',
};
akk.governance = {
  ...en.governance,
  nav: '𒄿𒉌𒈠 (Council)',
  council: {
    ...en.governance.council,
    title: '𒂍 𒄿𒉌 (parliament tablets)',
    empty: '𒈪 (no seated elders yet).',
  },
};
akk.telemetry = {
  ...en.telemetry,
  telemetry: '𒄿𒁉 𒊑 (watch-signs)',
  statusConnected: '𒋫 stream sealed',
  statusConnecting: '𒋫 stream approaching...',
  statusDisconnected: '𒋫 stream cut',
};
akk.kaigi = {
  ...en.kaigi,
  nav: 'KAIGI 𒂊𒇷 (relays)',
  overview: 'KAIGI 𒂊𒇷',
  relays: '𒂊𒇷 listed',
  domainMetrics: '𒆠 measures',
  liveEvents: '𒄿𒄑 living events',
  snapshotUnavailable: '𒁾 health tablet is dark',
};
akk.sorafs = {
  ...en.sorafs,
  registryNav: 'SoraFS 𒁾',
  registryTitle: 'SoraFS pin tablets',
  moderation: {
    ...en.sorafs.moderation,
    status: {
      ...en.sorafs.moderation.status,
      clear: 'gateway stands open for this CID',
      localBlocked: 'this gateway has sealed the CID locally',
      globalBlocked: 'this gateway obeys a global denylist seal',
      mixedBlocked: 'local and global denylist omens are both awake',
    },
    summary: {
      ...en.sorafs.moderation.summary,
      clear: 'public file roads remain open on this gateway tablet.',
      linksEnabled: 'moderation omens exist, yet this gateway still serves the public file roads.',
      linksBlocked: 'manifest signs remain visible, yet this gateway withholds the public file roads while the seal stands.',
    },
  },
  connect: {
    ...en.sorafs.connect,
    title: 'IrohaConnect 𒂍𒋗 (wallet gate)',
    description: 'Pair the wallet on this node tablet, approve the session, and sign the Ministry agenda tablet for the chosen CID.',
    createSession: 'forge wallet session',
    openWallet: 'open the IrohaConnect gate',
    approvedAccount: 'approved wallet omen',
    sessionStates: {
      ...en.sorafs.connect.sessionStates,
      idle: 'the session gate stands ready for IrohaConnect submission.',
      waiting_for_wallet: 'waiting for the wallet omen of approval.',
      approved: 'wallet approved; drafting the Ministry tablet.',
      signing: 'waiting for the wallet seal and transaction fate.',
      submitted: 'submission sealed and Ministry record opened.',
      wallet_rejected: 'the wallet cast away the Connect session.',
      session_closed: 'the Connect session gate closed before the rite ended.',
      submission_failed: 'the wallet submission rite failed.',
    },
    notifications: {
      ...en.sorafs.connect.notifications,
      walletRejected: 'the wallet cast away the session.',
      sessionClosed: 'the Connect session gate was shut.',
    },
  },
  proposal: {
    ...en.sorafs.proposal,
    title: 'CID denylist tablet',
    submitWallet: 'submit by IrohaConnect',
    walletSubmissionHelp: 'The explorer still keeps the JSON tablet fallback, yet this rite drafts the Ministry agenda transaction, asks the approved wallet for its seal, submits it, and opens the recorded proposal.',
    walletSubmissionComplete: 'The Ministry tablet is now sealed. The JSON draft may still be exported for audit or quiet review.',
    descriptionAdd: 'Shapes an AgendaProposalV1 tablet for the chosen root CID and an enumerated moderation omen.',
    descriptionRemove: 'Shapes an AgendaProposalV1 tablet to lift the chosen CID from the denylist, reusing the living moderation references when present.',
    submitStates: {
      ...en.sorafs.proposal.submitStates,
      waiting_for_wallet: 'waiting for wallet approval...',
      signing: 'sealing and submitting...',
      submitted: 'sealed',
    },
    payload: {
      ...en.sorafs.proposal.payload,
      titleAdd: 'Denylist tablet for {rootCid}',
      titleRemove: 'Denylist removal tablet for {rootCid}',
      motivationAdd: '{reason} review is sought for manifest {manifestDigest} and its public SoraFS root CID {rootCid}.',
      motivationRemove: 'Review is sought to lift manifest {manifestDigest} and its public SoraFS root CID {rootCid} from the denylist.',
      expectedImpactAdd: 'If the council seals this tablet, the chosen root CID joins the denylist so delivery may be restrained while the evidence is read.',
      expectedImpactRemove: 'If the council seals this tablet, the chosen root CID leaves the denylist so delivery may resume on joined gateways.',
      targetReasonAdd: '{reason} report for SoraFS CID {rootCid}',
      targetReasonRemove: 'Request to lift SoraFS CID {rootCid} from the denylist and restore delivery.',
      cidEvidenceDescriptionAdd: 'Manifest CAR tablet-evidence for {manifestDigest}.',
      cidEvidenceDescriptionRemove: 'Manifest CAR tablet-evidence for the removal review of {manifestDigest}.',
      urlEvidenceDescriptionAdd: 'Explorer tablet-evidence for manifest {manifestDigest}',
      urlEvidenceDescriptionRemove: 'Removal review tablet-evidence for manifest {manifestDigest}',
    },
  },
};
akk.soracloud = {
  ...en.soracloud,
  nav: 'SoraCloud 𒅗𒀭',
  title: 'SoraCloud 𒂍 𒋼 𒀭 (control tablets)',
  hint: 'Read living Soracloud omens: runtime, routing, and steward-signs from Torii.',
  refresh: '𒁉 read anew',
  source: '𒄿𒋫 omen-source',
  serviceInspector: '𒋼 service reader',
  modelInspector: '𒉈 model + training reader',
  hfAgentInspector: 'HF host/agent reader',
  queryIdle: 'Write the needed omen-names, then open this tablet.',
  validation: {
    ...en.soracloud.validation,
    accountId: 'Write a true i105 account omen or alias.',
    leaseTermMs: 'Lease ticks must be a whole living number of milliseconds.',
    hex: 'This omen must be even-count hex signs, with 0x if you wish.',
  },
};
akk.zkTelemetry = { ...en.zkTelemetry, nav: '𒍣𒆠 telemetry' };
akk.settings = {
  ...en.settings,
  language: '𒅗𒁺 (tongues)',
  theme: '𒉈𒊬 (skin of light)',
  nodeSelector: '𒇷 node',
  nodeLabel: 'Torii base omen',
  explorerBase: 'Explorer base tablet',
  reset: '𒋫 reset',
  apply: '𒆗 apply',
  nodeSaved: '𒁾 node sealed',
  nodeReset: '𒀀 node returned',
  presets: '𒈨 presets',
};
akk.dataspaces = {
  ...en.dataspaces,
  nav: '𒈨𒌍𒆠 (realms of records)',
  title: '𒈨𒌍𒆠 𒂍𒇽 𒁾 (realm-account tablet summary)',
  accountLiteralLabel: '𒂍𒇽 omen-sign',
  accountLiteralPlaceholder: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
  addressFormat: 'address-sign form',
  lookup: 'open summary tablet',
  hint: 'Set an account omen-sign to unveil UAID, realm-bonds, decree-tablets, treasury tallies, and concord vows.',
  accountRequired: 'account omen-sign must be written',
  accountNotFound: 'account tablet lies hidden',
  loadFailed: 'realm summary tablet would not open',
  uaid: 'UAID',
  totalDataspaces: 'realm count',
  boundAccounts: 'bound houses',
  portfolioPositions: 'treasury positions',
  manifests: 'decrees (awake/all)',
  manifestStatus: 'decree fate',
  manifestMissing: 'tablet absent',
  consensusTx: 'concord deeds',
  consensusChunks: 'concord shards',
  consensusBytes: 'concord bytes',
  consensusEntries: 'concord entries',
  consensusLanes: 'concord lanes',
  lastCommit: 'last sealed height',
  lastCommitHash: 'last seal omen',
  dataspacesTable: 'realm tablets',
  dataspace: 'realm',
  selectedTitle: 'chosen realm omens',
  accountsInDataspace: 'houses dwelling in the realm',
};

egy.search = '𓂋𓈖';
egy.noData = '𓏞𓏏';
egy.viewAll = '𓄿𓇋';
egy.searchUnsupported = '𓎛𓏏𓂋';
egy.domain = '𓈖𓏏𓊖';
egy.pageNotFound = '𓏞 𓈖 𓄿𓈖';
egy.none = '𓄿𓂋';
egy.total = '𓊃𓈖𓏏';
egy.widgets = {
  ...en.widgets,
  latestTransactions: '𓊪𓏏𓂋',
  latestBlocks: '𓈖𓃭𓎡',
};
egy.table = {
  ...en.table,
  rowsPerPage: '𓏞',
  pageOf: '{0}-{1} 𓅓 {2}',
};
egy.homePage = {
  ...en.homePage,
  totalAccounts: '𓂋𓈖𓉐',
  totalAssets: '𓎛𓂋',
  totalDomains: '𓈖𓏏𓊖',
  totalBlocks: '𓈖𓃭',
  totalTransactions: '𓊪𓏏𓂋',
  totalNodes: '𓅓𓂋',
  searchPlaceholder:
    '𓂋𓈖 𓈖𓃭/𓊪𓏏𓂋/I105/sora/norito account/asset#domain/nft$domain',
  title: {
    firstLine: '𓉔𓇌𓊪𓂋𓃭𓂧𓎼𓂋 𓇋𓂋𓉔𓄿',
    secondLine: '𓏞𓈖𓃭',
  },
  search: {
    ...en.homePage.search,
    placeholder:
      '𓂋𓈖 𓈖𓃭/𓊪𓏏𓂋/I105/sora/norito account/account alias/asset Base58 id or alias/nft$domain',
    hintTitle: '𓈖𓎛',
    samples: {
      block: '𓈖𓃭 12345',
      tx: '𓊪𓏏𓂋 0xabc123…',
      account: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
      asset: 'usd#issuer.main',
      nft: 'cool-cat$gallery',
      rwa: '01234567…$commodities',
    },
  },
};
egy.blocks = {
  ...en.blocks,
  blocks: '𓈖𓃭',
  block: '𓈖𓃭 #{0}',
  blockTransactions: '𓊪𓏏𓂋',
};
egy.assets = { ...en.assets, assets: '𓎛𓂋', assetsAndNFT: '𓎛𓂋 + 𓈖𓆑𓏏' };
egy.domains = { ...en.domains, domains: '𓈖𓏏𓊖' };
egy.accounts = { ...en.accounts, accounts: '𓂋𓈖𓉐' };
egy.transactions = {
  ...en.transactions,
  transactions: '𓊪𓏏𓂋',
  instructions: '𓏞𓎛',
  custom: '𓏞𓎛 𓄿𓈖',
  multisig: '𓂋𓈖 𓎛𓎛',
  committed: '𓎛𓏏',
  rejected: '𓌃𓄿',
  transactionDetails: '𓊪𓏏𓂋 𓏞',
  instructionDetails: '𓏞𓎛 𓏞',
  viewInstruction: '𓂋 𓏞𓎛',
  hideInstruction: '𓄿 𓏞𓎛',
  retryInstruction: '𓎛 𓎛',
  copyInstructionLink: '𓏞 𓎛𓏏',
  instructionLinkCopied: '𓏞 𓎛𓏏 𓎛',
};
egy.governance = {
  ...en.governance,
  nav: '𓅓𓂋𓏏',
  council: {
    ...en.governance.council,
    title: '𓏞 𓅓𓂋𓏏',
    empty: '𓄿',
  },
};
egy.telemetry = {
  ...en.telemetry,
  telemetry: '𓅓𓂋',
  statusConnected: '𓏞 𓎛𓏏',
  statusConnecting: '𓏞 𓂋𓈖',
  statusDisconnected: '𓏞 𓌃',
};
egy.kaigi = {
  ...en.kaigi,
  nav: '𓇋𓏏',
  overview: '𓇋𓏏',
  relays: '𓇋𓏏',
  domainMetrics: '𓈖𓏏 𓊃𓈖𓏏',
  liveEvents: '𓄿 𓊪𓏏𓂋',
  snapshotUnavailable: '𓏞 𓄿',
};
egy.sorafs = {
  ...en.sorafs,
  registryNav: '𓋴𓂋𓆑𓋴 𓏞',
  registryTitle: '𓋴𓂋𓆑𓋴 𓏞 𓌙',
  moderation: {
    ...en.sorafs.moderation,
    status: {
      ...en.sorafs.moderation.status,
      clear: 'this gateway leaves the CID open for viewing',
      localBlocked: 'this gateway has shut the CID by local decree',
      globalBlocked: 'this gateway follows a global denylist decree',
      mixedBlocked: 'local and global denylist decrees are both awake',
    },
    summary: {
      ...en.sorafs.moderation.summary,
      clear: 'public file roads remain open on this gateway.',
      linksEnabled: 'moderation signs exist, yet this gateway still serves the public file roads.',
      linksBlocked: 'manifest signs stay visible, but this gateway withholds the public file roads while the seal lives.',
    },
  },
  connect: {
    ...en.sorafs.connect,
    title: 'IrohaConnect 𓏞 wallet gate',
    description: 'Pair the wallet on this node, approve the session, and sign the Ministry agenda tablet for the chosen CID.',
    createSession: 'raise wallet session',
    openWallet: 'open IrohaConnect',
    approvedAccount: 'approved wallet name',
    sessionStates: {
      ...en.sorafs.connect.sessionStates,
      idle: 'the session gate is ready for IrohaConnect submission.',
      waiting_for_wallet: 'waiting for the wallet to grant approval.',
      approved: 'wallet approved; drafting the Ministry tablet.',
      signing: 'waiting for the wallet seal and transaction fate.',
      submitted: 'submission sealed and Ministry record opened.',
      wallet_rejected: 'the wallet refused the Connect session.',
      session_closed: 'the Connect session gate closed before the rite was finished.',
      submission_failed: 'the wallet submission rite failed.',
    },
    notifications: {
      ...en.sorafs.connect.notifications,
      walletRejected: 'the wallet refused the session.',
      sessionClosed: 'the Connect session gate was closed.',
    },
  },
  proposal: {
    ...en.sorafs.proposal,
    title: 'CID denylist tablet',
    submitWallet: 'submit through IrohaConnect',
    walletSubmissionHelp: 'The explorer still keeps the JSON tablet fallback, yet this rite drafts the Ministry agenda transaction, asks the approved wallet for its seal, submits it, and opens the recorded proposal.',
    walletSubmissionComplete: 'The Ministry tablet is now sealed. The JSON draft may still be exported for audit or quiet review.',
    descriptionAdd: 'Shapes an AgendaProposalV1 tablet for the chosen root CID and an enumerated moderation sign.',
    descriptionRemove: 'Shapes an AgendaProposalV1 tablet to lift the chosen CID from the denylist, reusing the living moderation references when present.',
    submitStates: {
      ...en.sorafs.proposal.submitStates,
      waiting_for_wallet: 'waiting for wallet approval...',
      signing: 'sealing and submitting...',
      submitted: 'sealed',
    },
    payload: {
      ...en.sorafs.proposal.payload,
      titleAdd: 'Denylist tablet for {rootCid}',
      titleRemove: 'Denylist removal tablet for {rootCid}',
      motivationAdd: '{reason} review is sought for manifest {manifestDigest} and its public SoraFS root CID {rootCid}.',
      motivationRemove: 'Review is sought to lift manifest {manifestDigest} and its public SoraFS root CID {rootCid} from the denylist.',
      expectedImpactAdd: 'If the council seals this tablet, the chosen root CID joins the denylist so delivery may be restrained while the evidence is read.',
      expectedImpactRemove: 'If the council seals this tablet, the chosen root CID leaves the denylist so delivery may resume on joined gateways.',
      targetReasonAdd: '{reason} report for SoraFS CID {rootCid}',
      targetReasonRemove: 'Request to lift SoraFS CID {rootCid} from the denylist and restore delivery.',
      cidEvidenceDescriptionAdd: 'Manifest CAR tablet-evidence for {manifestDigest}.',
      cidEvidenceDescriptionRemove: 'Manifest CAR tablet-evidence for the removal review of {manifestDigest}.',
      urlEvidenceDescriptionAdd: 'Explorer tablet-evidence for manifest {manifestDigest}',
      urlEvidenceDescriptionRemove: 'Removal review tablet-evidence for manifest {manifestDigest}',
    },
  },
};
egy.soracloud = {
  ...en.soracloud,
  nav: 'SoraCloud 𓇋𓈖',
  title: 'SoraCloud 𓉐 𓌙 𓎛𓏏',
  hint: '𓈖𓎛 Soracloud runtime, routing, and control-plane signs from Torii.',
  refresh: '𓎛 𓂋',
  source: '𓈖𓂋',
  serviceInspector: '𓎛𓎼 service reader',
  modelInspector: '𓎛𓂋 model + training reader',
  hfAgentInspector: 'HF host/agent reader',
  queryIdle: '𓎛𓏏 the needed names, then open this tablet.',
  validation: {
    ...en.soracloud.validation,
    accountId: 'Use a true i105 account sign or alias.',
    leaseTermMs: 'Lease time must be a whole positive millisecond count.',
    hex: 'This sign must be even hex marks, with 0x if desired.',
  },
};
egy.zkTelemetry = { ...en.zkTelemetry, nav: '𓊃𓎡' };
egy.settings = {
  ...en.settings,
  language: '𓂋𓈖',
  theme: '𓊹',
  nodeSelector: '𓅓𓂋',
  nodeLabel: '𓏞 𓂋𓈖',
  explorerBase: '𓏞𓈖𓃭',
  reset: '𓄿',
  apply: '𓎛',
  nodeSaved: '𓏞 𓎛𓏏',
  nodeReset: '𓄿 𓎛',
  presets: '𓈖',
};
egy.dataspaces = {
  ...en.dataspaces,
  nav: '𓏞𓈖𓎡𓏏',
  title: '𓏞𓈖𓎡𓏏 𓂋𓈖 𓏞',
  accountLiteralLabel: '𓂋𓈖 𓏞𓎛',
  accountLiteralPlaceholder: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
  addressFormat: '𓏞𓎛 𓎛',
  lookup: '𓂋 𓏞',
  hint: '𓂋𓈖 𓏞𓎛 𓂋 𓅓 UAID 𓄿 𓏞𓈖𓎡𓏏 𓄿 𓏞 𓊪𓏏𓂋 𓄿 𓅓𓂋 𓎛',
  accountRequired: '𓂋𓈖 𓏞𓎛 𓎛',
  accountNotFound: '𓂋𓈖 𓄿',
  loadFailed: '𓏞𓈖𓎡𓏏 𓏞 𓄿',
  uaid: 'UAID',
  totalDataspaces: '𓏞𓈖𓎡𓏏',
  boundAccounts: '𓂋𓈖 𓌢',
  portfolioPositions: '𓎛𓂋 𓎛',
  manifests: '𓏞 (𓎛/𓊃)',
  manifestStatus: '𓏞 𓎛',
  manifestMissing: '𓄿',
  consensusTx: '𓅓𓂋 𓊪𓏏𓂋',
  consensusChunks: '𓅓𓂋 𓏞𓏥',
  consensusBytes: '𓅓𓂋 𓃀𓇌𓏏',
  consensusEntries: '𓅓𓂋 𓏞',
  consensusLanes: '𓅓𓂋 𓎡𓈖',
  lastCommit: '𓎛 𓎛𓏏 𓎡𓏏',
  lastCommitHash: '𓎛 𓎛𓏏 𓎛𓏏',
  dataspacesTable: '𓏞𓈖𓎡𓏏',
  dataspace: '𓏞𓈖𓎡𓏏',
  selectedTitle: '𓏞𓈖𓎡𓏏 𓏞 𓎛',
  accountsInDataspace: '𓏞𓈖𓎡𓏏 𓅓 𓂋𓈖',
};

akk.vpn = {
  ...en.vpn,
  nav: 'VPN 𒅎',
  title: 'VPN omen tallies',
  overviewTitle: 'VPN omen overview',
  breakdownTitle: 'traffic-sign reckoning',
  countriesTitle: 'lands',
  trafficClassesTitle: 'traffic families',
  receiptsTitle: 'receipts',
  source: 'chosen node omen',
  runtimeState: 'runtime fate',
  sessions: 'sessions',
  totalBytes: 'whole bytes',
  ingress: 'inbound',
  ingressBytes: 'inbound bytes',
  egress: 'outbound',
  egressBytes: 'outbound bytes',
  dataBytes: 'data bytes',
  coverBytes: 'cover bytes',
  controlBytes: 'control bytes',
  receiptIngressBytes: 'receipt inbound bytes',
  receiptEgressBytes: 'receipt outbound bytes',
  receiptCoverBytes: 'receipt cover bytes',
  country: 'land',
  peers: 'peer tablets',
  connectedPeers: 'bound together',
  unknownCountry: 'land unknown',
  unavailable: 'VPN omens stay hidden for the chosen node tablet.',
  countryDataUnavailable: 'land omens stay hidden for the chosen node tablet.',
  statusLabels: {
    active: 'awakened',
    stubbed: 'stub omen',
    disabled: 'sealed shut',
    unknown: 'unread',
  },
};

egy.vpn = {
  ...en.vpn,
  nav: 'VPN 𓅓',
  title: '𓏞 VPN',
  overviewTitle: 'VPN 𓌙',
  breakdownTitle: '𓊪𓏏𓂋 𓏞',
  countriesTitle: '𓈖𓏏',
  trafficClassesTitle: '𓊪𓏏𓂋 𓎡𓈖',
  receiptsTitle: '𓏞𓎛',
  source: '𓅓𓂋 𓎛',
  runtimeState: '𓎛 𓏞',
  sessions: '𓋴𓋴',
  totalBytes: '𓃀𓇌𓏏 𓊃𓈖𓏏',
  ingress: '𓂋 𓇋',
  ingressBytes: '𓃀𓇌𓏏 𓂋 𓇋',
  egress: '𓂋 𓊪',
  egressBytes: '𓃀𓇌𓏏 𓂋 𓊪',
  dataBytes: '𓃀𓇌𓏏 𓏞𓏥',
  coverBytes: '𓃀𓇌𓏏 𓎡𓃭',
  controlBytes: '𓃀𓇌𓏏 𓎛',
  receiptIngressBytes: '𓏞𓎛 𓂋 𓇋 𓃀𓇌𓏏',
  receiptEgressBytes: '𓏞𓎛 𓂋 𓊪 𓃀𓇌𓏏',
  receiptCoverBytes: '𓏞𓎛 𓎡𓃭 𓃀𓇌𓏏',
  country: '𓈖𓏏',
  peers: '𓅓𓂋',
  connectedPeers: '𓎛𓏏',
  unknownCountry: '𓄿𓈖',
  unavailable: 'VPN 𓏞 𓄿 𓅓 𓅓𓂋 𓎛',
  countryDataUnavailable: '𓈖𓏏 𓏞 𓄿 𓅓 𓅓𓂋 𓎛',
  statusLabels: {
    active: '𓄿𓂧',
    stubbed: '𓋴𓏏𓃀',
    disabled: '𓄿 𓎛',
    unknown: '𓄿𓈖',
  },
};

type AccountsLocaleCopy = Pick<
  LocaleMessages['accounts'],
  | 'accounts'
  | 'accountInformation'
  | 'accountAddressFormats'
  | 'accountAddressI105Label'
  | 'accountAddressDefaultDomain'
  | 'accountAddressExplicitDomain'
  | 'accountAddressQrCaption'
  | 'accountAddressQrError'
  | 'accountAddressQrAlt'
  | 'accountAssets'
  | 'accountNFTs'
  | 'accountDomains'
  | 'accountTransactions'
  | 'accountDoesntHaveAnyAssets'
  | 'accountDoesntHaveAnyNFTs'
  | 'accountDoesntHaveAnyDomains'
>;

interface AccountPageLocaleCopy {
  id: string
  name: string
  value: string
  metadata: string
  none: string
  rowsPerPage: string
  pageOf: string
  accounts: AccountsLocaleCopy
}

function applyAccountPageLocale(locale: LocaleMessages, copy: AccountPageLocaleCopy) {
  locale.id = copy.id;
  locale.name = copy.name;
  locale.value = copy.value;
  locale.metadata = copy.metadata;
  locale.none = copy.none;
  locale.table = {
    ...locale.table,
    rowsPerPage: copy.rowsPerPage,
    pageOf: copy.pageOf,
  };
  locale.accounts = {
    ...en.accounts,
    ...locale.accounts,
    ...copy.accounts,
  };
}

applyAccountPageLocale(akk, {
  id: '𒁹𒀭 (name-seal)',
  name: '𒈬 (name)',
  value: '𒋗 (measure)',
  metadata: '𒈨𒌍 (archive signs)',
  none: '𒇻 (none)',
  rowsPerPage: '𒁾 signs per tablet',
  pageOf: '{0}-{1} 𒅗 {2}',
  accounts: {
    accounts: '𒂍𒇽 (houses of names)',
    accountInformation: '𒂍𒇽 𒀉 (house tablet)',
    accountAddressFormats: '𒂍𒇽 road-sign forms',
    accountAddressI105Label: 'I105 (realm road-sign {prefix})',
    accountAddressDefaultDomain: 'first land-sign: {domain}',
    accountAddressExplicitDomain: 'chosen land-sign: {domain}',
    accountAddressQrCaption: 'I105 gate-sigil',
    accountAddressQrError: 'Cannot carve a gate-sigil for this I105 sign.',
    accountAddressQrAlt: 'gate-sigil bearing the I105 omen',
    accountAssets: '𒉈 held by this house',
    accountNFTs: 'NFT omens of this house',
    accountDomains: '𒆠 lands under this house',
    accountTransactions: '𒄿𒋼𒁕 deeds of this house',
    accountDoesntHaveAnyAssets: 'this house tablet holds no wealth-signs',
    accountDoesntHaveAnyNFTs: 'this house tablet bears no NFT omens',
    accountDoesntHaveAnyDomains: 'this house tablet governs no lands',
  },
});

applyAccountPageLocale(egy, {
  id: '𓁹',
  name: '𓂋𓈖',
  value: '𓊹',
  metadata: '𓏞',
  none: '𓄿𓂋',
  rowsPerPage: '𓏞',
  pageOf: '{0}-{1} 𓅓 {2}',
  accounts: {
    accounts: '𓂋𓈖',
    accountInformation: '𓂋𓈖 𓏞',
    accountAddressFormats: '𓂋𓈖 𓏞𓎛',
    accountAddressI105Label: '𓇋𓉔58 ({prefix})',
    accountAddressDefaultDomain: '𓈖𓏏𓊖 {domain}',
    accountAddressExplicitDomain: '𓈖𓏏 {domain}',
    accountAddressQrCaption: '𓇋𓉔58 𓏞',
    accountAddressQrError: '𓄿 𓏞 𓇋𓉔58',
    accountAddressQrAlt: '𓏞 𓇋𓉔58',
    accountAssets: '𓎛𓂋',
    accountNFTs: '𓈖𓆑𓏏',
    accountDomains: '𓈖𓏏',
    accountTransactions: '𓊪𓏏𓂋',
    accountDoesntHaveAnyAssets: '𓄿 𓎛𓂋',
    accountDoesntHaveAnyNFTs: '𓄿 𓈖𓆑𓏏',
    accountDoesntHaveAnyDomains: '𓄿 𓈖𓏏',
  },
});

type LocaleMessageValue = string | number | boolean | LocaleMessageObject | LocaleMessageValue[];
interface LocaleMessageObject { [key: string]: LocaleMessageValue }

function escapeLinkedAt(value: string): string {
  return value.replace(/@/g, "{'@'}");
}

function sanitizeLocaleValue(value: LocaleMessageValue): LocaleMessageValue {
  if (typeof value === 'string') {
    return escapeLinkedAt(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLocaleValue(entry));
  }
  if (value && typeof value === 'object') {
    const sanitized: LocaleMessageObject = {};
    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = sanitizeLocaleValue(entry);
    }
    return sanitized;
  }
  return value;
}

export const SUPPORTED_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'jp',
  'dv',
  'uk',
  'ur',
  'he',
  'ar',
  'dz',
  'ne',
  'my',
  'zh-TW',
  'kh',
  'ko',
  'th',
  'am',
  'az',
  'hy',
  'ka',
  'tr',
  'si',
  'ta',
  'id',
  'akk',
  'egy',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

const jsonLocaleLoaders: Record<Exclude<SupportedLocale, 'en' | 'akk' | 'egy'>, () => Promise<LocaleMessages>> = {
  fr: async () => (await import('./fr.json')).default as LocaleMessages,
  es: async () => (await import('./es.json')).default as LocaleMessages,
  de: async () => (await import('./de.json')).default as LocaleMessages,
  ru: async () => (await import('./ru.json')).default as LocaleMessages,
  jp: async () => (await import('./jp.json')).default as LocaleMessages,
  dv: async () => (await import('./dv.json')).default as LocaleMessages,
  uk: async () => (await import('./uk.json')).default as LocaleMessages,
  ur: async () => (await import('./ur.json')).default as LocaleMessages,
  he: async () => (await import('./he.json')).default as LocaleMessages,
  ar: async () => (await import('./ar.json')).default as LocaleMessages,
  dz: async () => (await import('./dz.json')).default as LocaleMessages,
  ne: async () => (await import('./ne.json')).default as LocaleMessages,
  my: async () => (await import('./my.json')).default as LocaleMessages,
  'zh-TW': async () => (await import('./zh-TW.json')).default as LocaleMessages,
  kh: async () => (await import('./kh.json')).default as LocaleMessages,
  ko: async () => (await import('./ko.json')).default as LocaleMessages,
  th: async () => (await import('./th.json')).default as LocaleMessages,
  am: async () => (await import('./am.json')).default as LocaleMessages,
  az: async () => (await import('./az.json')).default as LocaleMessages,
  hy: async () => (await import('./hy.json')).default as LocaleMessages,
  ka: async () => (await import('./ka.json')).default as LocaleMessages,
  tr: async () => (await import('./tr.json')).default as LocaleMessages,
  si: async () => (await import('./si.json')).default as LocaleMessages,
  ta: async () => (await import('./ta.json')).default as LocaleMessages,
  id: async () => (await import('./id.json')).default as LocaleMessages,
};

async function loadLocaleMessages(locale: SupportedLocale): Promise<LocaleMessages> {
  if (locale === 'en') return en;
  if (locale === 'akk') return akk;
  if (locale === 'egy') return egy;
  return await jsonLocaleLoaders[locale]();
}

const loadedLocales = new Set<SupportedLocale>(['en']);

const messages = sanitizeLocaleValue({ en }) as any;

export const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages,
  globalInjection: true,
  legacy: false,
});

export async function ensureLocaleLoaded(locale: string): Promise<SupportedLocale> {
  const normalized: SupportedLocale = isSupportedLocale(locale) ? locale : 'en';
  if (loadedLocales.has(normalized)) return normalized;

  try {
    const messages = await loadLocaleMessages(normalized);
    i18n.global.setLocaleMessage(normalized, sanitizeLocaleValue(messages) as any);
    loadedLocales.add(normalized);
    return normalized;
  } catch {
    return 'en';
  }
}
