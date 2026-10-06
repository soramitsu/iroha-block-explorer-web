import { z } from 'zod';
import { requireNetworkPrefix } from '@/shared/lib/network-prefix';
import type { Instruction } from '@/shared/api/schemas';
import { AccountSelectorSchema, AssetDefinitionSelectorSchema, AssetIdSchema, NftIdSchema } from '@/shared/api/schemas';

type AnyRecord = Record<string, unknown>;
type PresentationBuilder = (value: unknown) => InstructionPresentation | null;
type EntityRouteKind = 'account' | 'asset' | 'asset-definition' | 'domain' | 'nft';

export interface InstructionPresentationField {
  key: string;
  label: string;
  value: string;
  link: string | null;
}

export interface NestedInstructionPresentation {
  index: number;
  encoded: string;
  presentation: InstructionPresentation | null;
}

export interface InstructionPresentation {
  registryKey: string;
  family: string;
  variant: string;
  kindLabel: string;
  title: string;
  fields: InstructionPresentationField[];
  primaryEntity: InstructionPresentationField | null;
  nestedInstructions: NestedInstructionPresentation[];
}

const AnyRecordSchema = z.record(z.string(), z.unknown());
const NonEmptyStringSchema = z.string().min(1);
const QuantityStringSchema = z.string().min(1);
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const DefinedValueSchema = z.unknown().refine((value) => value !== undefined);
const DomainIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*\.[A-Za-z0-9][A-Za-z0-9_-]*$/u);
const ExplorerEnvelopeSchema = z
  .object({
    variant: NonEmptyStringSchema,
    value: z.unknown(),
  })
  .strict();

const RegisterValueSchema = z.object({ object: AnyRecordSchema }).passthrough();
const UnregisterValueSchema = z.object({ object: NonEmptyStringSchema }).passthrough();
const QuantityDestinationSchema = z
  .object({
    object: QuantityStringSchema,
    destination: NonEmptyStringSchema,
  })
  .passthrough();
const RepetitionDestinationSchema = z
  .object({
    object: NonNegativeIntegerSchema,
    destination: NonEmptyStringSchema,
  })
  .passthrough();
const TransferValueSchema = z
  .object({
    source: NonEmptyStringSchema,
    object: NonEmptyStringSchema,
    destination: NonEmptyStringSchema,
  })
  .passthrough();
const AssetBatchValueSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            from: NonEmptyStringSchema,
            to: NonEmptyStringSchema,
            asset_definition: NonEmptyStringSchema,
            amount: QuantityStringSchema,
          })
          .passthrough()
      )
      .min(1),
  })
  .passthrough();
const MetadataValueSchema = z
  .object({
    object: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
    value: DefinedValueSchema,
  })
  .passthrough();
const AssetMetadataValueSchema = z
  .object({
    asset: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
    value: DefinedValueSchema,
  })
  .passthrough();
const MetadataRemovalSchema = z
  .object({
    object: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
  })
  .passthrough();
const AssetMetadataRemovalSchema = z
  .object({
    asset: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
  })
  .passthrough();
const GrantRevokeValueSchema = z
  .object({
    object: DefinedValueSchema,
    destination: NonEmptyStringSchema,
  })
  .passthrough();
const ExecuteTriggerValueSchema = z
  .object({
    trigger: NonEmptyStringSchema,
    args: DefinedValueSchema,
  })
  .passthrough();
const RuntimeUpgradeIdSchema = z.object({ id: NonEmptyStringSchema }).passthrough();
const RuntimeUpgradeProposalSchema = z.object({ manifest_bytes: z.array(NonNegativeIntegerSchema) }).passthrough();
const LogValueSchema = z
  .object({
    level: NonEmptyStringSchema,
    msg: z.string(),
  })
  .passthrough();
const ShieldValueSchema = z
  .object({
    asset: NonEmptyStringSchema,
    from: NonEmptyStringSchema,
    amount: QuantityStringSchema,
    note_commitment: DefinedValueSchema,
    enc_payload: DefinedValueSchema,
  })
  .passthrough();
const ZkTransferValueSchema = z
  .object({
    asset: NonEmptyStringSchema,
    inputs: z.array(z.unknown()),
    outputs: z.array(z.unknown()),
    proof: DefinedValueSchema,
    root_hint: DefinedValueSchema,
  })
  .passthrough();
const UnshieldValueSchema = z
  .object({
    asset: NonEmptyStringSchema,
    to: NonEmptyStringSchema,
    public_amount: QuantityStringSchema,
    inputs: z.array(z.unknown()),
    outputs: z.array(z.unknown()),
    proof: DefinedValueSchema,
    root_hint: DefinedValueSchema,
  })
  .passthrough();
const KagemushaTopUpValueSchema = z
  .object({
    asset: NonEmptyStringSchema,
    amount_atomic_units: QuantityStringSchema,
    asset_scale: NonNegativeIntegerSchema,
    note_commitment: NonEmptyStringSchema,
    operation_id: NonEmptyStringSchema,
  })
  .passthrough();
const KagemushaRedeemValueSchema = KagemushaTopUpValueSchema.extend({
  recipient: NonEmptyStringSchema,
});
const MultisigRegisterSchema = z
  .object({
    account: NonEmptyStringSchema,
    home_domain: NonEmptyStringSchema.nullable().optional(),
    spec: z
      .object({
        signatories: z.record(NonEmptyStringSchema, NonNegativeIntegerSchema),
        quorum: z.number().int().positive(),
        transaction_ttl_ms: z.number().int().positive(),
      })
      .passthrough(),
  })
  .passthrough();
const MultisigProposeSchema = z
  .object({
    account: NonEmptyStringSchema,
    instructions: z.array(z.string()),
    transaction_ttl_ms: z.number().int().positive().nullable(),
  })
  .passthrough();
const MultisigDecisionSchema = z
  .object({
    account: NonEmptyStringSchema,
    instructions_hash: NonEmptyStringSchema,
  })
  .passthrough();

const variantEntityKinds: Readonly<Record<string, EntityRouteKind | null>> = {
  Account: 'account',
  Asset: 'asset',
  AssetDefinition: 'asset-definition',
  Domain: 'domain',
  Nft: 'nft',
  Peer: null,
  Role: null,
  Trigger: null,
};

function asRecord(value: unknown): AnyRecord | null {
  const parsed = AnyRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function compactJson(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null) return 'null';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assetDefinitionFromAssetId(value: string): string | null {
  const parsedAsset = AssetIdSchema.safeParse(value);
  if (!parsedAsset.success) return null;
  const separator = parsedAsset.data.indexOf('#');
  if (separator <= 0) return null;
  const definition = parsedAsset.data.slice(0, separator);
  return AssetDefinitionSelectorSchema.safeParse(definition).success ? definition : null;
}

function entityRoute(kind: EntityRouteKind | null, value: string): string | null {
  if (!kind) return null;

  if (kind === 'account') {
    const parsed = AccountSelectorSchema.safeParse(value);
    return parsed.success ? `/accounts/${encodeURIComponent(parsed.data)}` : null;
  }
  if (kind === 'asset-definition') {
    const parsed = AssetDefinitionSelectorSchema.safeParse(value);
    return parsed.success ? `/assets/${encodeURIComponent(parsed.data)}` : null;
  }
  if (kind === 'asset') {
    const definition = assetDefinitionFromAssetId(value);
    return definition ? `/assets/${encodeURIComponent(definition)}` : null;
  }
  if (kind === 'nft') {
    const parsed = NftIdSchema.safeParse(value);
    return parsed.success ? `/nfts/${encodeURIComponent(parsed.data)}` : null;
  }

  const parsed = DomainIdSchema.safeParse(value);
  return parsed.success ? `/domains/${encodeURIComponent(parsed.data)}` : null;
}

function field(
  ...[key, label, value, entityKind = null]: [
    key: string,
    label: string,
    value: unknown,
    entityKind?: EntityRouteKind | null,
  ]
) {
  const text = compactJson(value);
  return {
    key,
    label,
    value: text,
    link: entityRoute(entityKind, text),
  } satisfies InstructionPresentationField;
}

function presentation(
  ...[registryKey, family, variant, title, fields, options = {}]: [
    registryKey: string,
    family: string,
    variant: string,
    title: string,
    fields: InstructionPresentationField[],
    options?: {
      kindLabel?: string;
      primaryKey?: string;
      nestedInstructions?: NestedInstructionPresentation[];
    },
  ]
): InstructionPresentation {
  return {
    registryKey,
    family,
    variant,
    kindLabel: options.kindLabel ?? family,
    title,
    fields,
    primaryEntity: options.primaryKey
      ? (fields.find((candidate) => candidate.key === options.primaryKey) ?? null)
      : null,
    nestedInstructions: options.nestedInstructions ?? [],
  };
}

function registerBuilder(variant: string, noun: string): PresentationBuilder {
  return (value) => {
    const parsed = RegisterValueSchema.safeParse(value);
    if (!parsed.success) return null;
    const objectId = parsed.data.object.id;
    const fields =
      typeof objectId === 'string'
        ? [field('object', noun, objectId, variantEntityKinds[variant] ?? null)]
        : [field('object', noun, parsed.data.object)];
    return presentation(`Register:${variant}`, 'Register', variant, `${noun} registration`, fields, {
      primaryKey: 'object',
    });
  };
}

function unregisterBuilder(variant: string, noun: string): PresentationBuilder {
  return (value) => {
    const parsed = UnregisterValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      `Unregister:${variant}`,
      'Unregister',
      variant,
      `${noun} removal`,
      [field('object', noun, parsed.data.object, variantEntityKinds[variant] ?? null)],
      { primaryKey: 'object' }
    );
  };
}

function assetQuantityBuilder(family: 'Mint' | 'Burn'): PresentationBuilder {
  return (value) => {
    const parsed = QuantityDestinationSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      `${family}:Asset`,
      family,
      'Asset',
      `Asset ${family.toLowerCase()}`,
      [field('amount', 'Amount', parsed.data.object), field('asset', 'Asset', parsed.data.destination, 'asset')],
      { primaryKey: 'asset' }
    );
  };
}

function triggerRepetitionBuilder(family: 'Mint' | 'Burn'): PresentationBuilder {
  return (value) => {
    const parsed = RepetitionDestinationSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      `${family}:TriggerRepetitions`,
      family,
      'TriggerRepetitions',
      `Trigger repetition ${family.toLowerCase()}`,
      [field('repetitions', 'Repetitions', parsed.data.object), field('trigger', 'Trigger', parsed.data.destination)],
      { primaryKey: 'trigger' }
    );
  };
}

function transferBuilder(variant: 'Domain' | 'AssetDefinition' | 'Asset' | 'Nft', noun: string): PresentationBuilder {
  return (value) => {
    const parsed = TransferValueSchema.safeParse(value);
    if (!parsed.success) return null;
    if (variant === 'Asset') {
      return presentation(
        'Transfer:Asset',
        'Transfer',
        'Asset',
        'Asset transfer',
        [
          field('source', 'Asset', parsed.data.source, 'asset'),
          field('amount', 'Amount', parsed.data.object),
          field('destination', 'Destination', parsed.data.destination, 'account'),
        ],
        { primaryKey: 'source' }
      );
    }

    return presentation(
      `Transfer:${variant}`,
      'Transfer',
      variant,
      `${noun} transfer`,
      [
        field('source', 'Source', parsed.data.source, 'account'),
        field('object', noun, parsed.data.object, variantEntityKinds[variant] ?? null),
        field('destination', 'Destination', parsed.data.destination, 'account'),
      ],
      { primaryKey: 'object' }
    );
  };
}

function assetBatchBuilder(value: unknown): InstructionPresentation | null {
  const parsed = AssetBatchValueSchema.safeParse(value);
  if (!parsed.success) return null;
  const fields: InstructionPresentationField[] = [field('entries', 'Entries', parsed.data.entries.length)];
  parsed.data.entries.forEach((entry, index) => {
    const suffix = index + 1;
    fields.push(
      field(`asset-${index}`, `Asset ${suffix}`, entry.asset_definition, 'asset-definition'),
      field(`amount-${index}`, `Amount ${suffix}`, entry.amount),
      field(`source-${index}`, `Source ${suffix}`, entry.from, 'account'),
      field(`destination-${index}`, `Destination ${suffix}`, entry.to, 'account')
    );
  });
  return presentation('Transfer:AssetBatch', 'Transfer', 'AssetBatch', 'Asset batch transfer', fields, {
    primaryKey: 'asset-0',
  });
}

function metadataBuilder(family: 'SetKeyValue' | 'RemoveKeyValue', variant: string, noun: string): PresentationBuilder {
  return (value) => {
    const isAsset = variant === 'Asset';
    if (family === 'SetKeyValue') {
      const parsed = (isAsset ? AssetMetadataValueSchema : MetadataValueSchema).safeParse(value);
      if (!parsed.success) return null;
      const target = isAsset ? parsed.data.asset : parsed.data.object;
      return presentation(
        `${family}:${variant}`,
        family,
        variant,
        `${noun} metadata update`,
        [
          field('target', noun, target, variantEntityKinds[variant] ?? null),
          field('key', 'Key', parsed.data.key),
          field('value', 'Value', parsed.data.value),
        ],
        { primaryKey: 'target' }
      );
    }

    const parsed = (isAsset ? AssetMetadataRemovalSchema : MetadataRemovalSchema).safeParse(value);
    if (!parsed.success) return null;
    const target = isAsset ? parsed.data.asset : parsed.data.object;
    return presentation(
      `${family}:${variant}`,
      family,
      variant,
      `${noun} metadata removal`,
      [field('target', noun, target, variantEntityKinds[variant] ?? null), field('key', 'Key', parsed.data.key)],
      { primaryKey: 'target' }
    );
  };
}

function grantRevokeBuilder(
  ...[family, variant, title, destinationLabel, destinationKind]: [
    family: 'Grant' | 'Revoke',
    variant: string,
    title: string,
    destinationLabel: string,
    destinationKind: EntityRouteKind | null,
  ]
): PresentationBuilder {
  return (value) => {
    const parsed = GrantRevokeValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      `${family}:${variant}`,
      family,
      variant,
      title,
      [
        field(
          'object',
          variant.includes('RoleTo') || variant.includes('RoleFrom') ? 'Role' : 'Permission',
          parsed.data.object
        ),
        field('destination', destinationLabel, parsed.data.destination, destinationKind),
      ],
      { primaryKey: 'destination' }
    );
  };
}

function exactTaggedValue(value: unknown, variants: readonly string[]): { variant: string; value: unknown } | null {
  const record = asRecord(value);
  if (!record || Object.keys(record).length !== 1) return null;
  for (const variant of variants) {
    if (Object.prototype.hasOwnProperty.call(record, variant)) {
      return { variant, value: record[variant] };
    }
  }
  return null;
}

function multisigRegisterBuilder(value: unknown): InstructionPresentation | null {
  const parsed = MultisigRegisterSchema.safeParse(value);
  if (!parsed.success) return null;
  const fields = [
    field('account', 'Registration account', parsed.data.account, 'account'),
    field('quorum', 'Quorum', parsed.data.spec.quorum),
    field('ttl', 'Default TTL (ms)', parsed.data.spec.transaction_ttl_ms),
    field('signatories', 'Signatories', Object.keys(parsed.data.spec.signatories).length),
  ];
  if (parsed.data.home_domain) {
    fields.push(field('home-domain', 'Home domain', parsed.data.home_domain, 'domain'));
  }
  Object.entries(parsed.data.spec.signatories).forEach(([account, weight], index) => {
    fields.push(field(`signatory-${index}`, `Signatory ${index + 1} (weight ${weight})`, account, 'account'));
  });
  return presentation('Custom:Register', 'Custom', 'Register', 'Multisig registration', fields, {
    kindLabel: 'Multisig',
    primaryKey: 'account',
  });
}

function multisigProposeBuilder(value: unknown): InstructionPresentation | null {
  const parsed = MultisigProposeSchema.safeParse(value);
  if (!parsed.success) return null;
  // Torii supplies encoded nested instructions here. The canonical decoder is
  // native-only; retain the exact bytes instead of inventing browser semantics.
  const nestedInstructions = parsed.data.instructions.map((encoded, index) => ({
    index,
    encoded,
    presentation: null,
  }));
  const fields = [
    field('account', 'Multisig account', parsed.data.account, 'account'),
    field('instructions', 'Proposed instructions', parsed.data.instructions.length),
  ];
  if (parsed.data.transaction_ttl_ms !== null) {
    fields.push(field('ttl', 'Proposal TTL (ms)', parsed.data.transaction_ttl_ms));
  }
  return presentation('Custom:Propose', 'Custom', 'Propose', 'Multisig proposal', fields, {
    kindLabel: 'Multisig',
    primaryKey: 'account',
    nestedInstructions,
  });
}

function multisigDecisionBuilder(variant: 'Approve' | 'Cancel', title: string): PresentationBuilder {
  return (value) => {
    const parsed = MultisigDecisionSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      `Custom:${variant}`,
      'Custom',
      variant,
      title,
      [
        field('account', 'Multisig account', parsed.data.account, 'account'),
        field('hash', 'Instructions hash', parsed.data.instructions_hash),
      ],
      { kindLabel: 'Multisig', primaryKey: 'account' }
    );
  };
}

const registry: Readonly<Record<string, PresentationBuilder>> = Object.freeze({
  'Register:Peer': registerBuilder('Peer', 'Peer'),
  'Register:Domain': registerBuilder('Domain', 'Domain'),
  'Register:Account': registerBuilder('Account', 'Account'),
  'Register:AssetDefinition': registerBuilder('AssetDefinition', 'Asset definition'),
  'Register:Nft': registerBuilder('Nft', 'NFT'),
  'Register:Role': registerBuilder('Role', 'Role'),
  'Register:Trigger': registerBuilder('Trigger', 'Trigger'),
  'Unregister:Peer': unregisterBuilder('Peer', 'Peer'),
  'Unregister:Domain': unregisterBuilder('Domain', 'Domain'),
  'Unregister:Account': unregisterBuilder('Account', 'Account'),
  'Unregister:AssetDefinition': unregisterBuilder('AssetDefinition', 'Asset definition'),
  'Unregister:Nft': unregisterBuilder('Nft', 'NFT'),
  'Unregister:Role': unregisterBuilder('Role', 'Role'),
  'Unregister:Trigger': unregisterBuilder('Trigger', 'Trigger'),
  'Mint:Asset': assetQuantityBuilder('Mint'),
  'Mint:TriggerRepetitions': triggerRepetitionBuilder('Mint'),
  'Burn:Asset': assetQuantityBuilder('Burn'),
  'Burn:TriggerRepetitions': triggerRepetitionBuilder('Burn'),
  'Transfer:Domain': transferBuilder('Domain', 'Domain'),
  'Transfer:AssetDefinition': transferBuilder('AssetDefinition', 'Asset definition'),
  'Transfer:Asset': transferBuilder('Asset', 'Asset'),
  'Transfer:Nft': transferBuilder('Nft', 'NFT'),
  'Transfer:AssetBatch': assetBatchBuilder,
  'SetKeyValue:Domain': metadataBuilder('SetKeyValue', 'Domain', 'Domain'),
  'SetKeyValue:Account': metadataBuilder('SetKeyValue', 'Account', 'Account'),
  'SetKeyValue:AssetDefinition': metadataBuilder('SetKeyValue', 'AssetDefinition', 'Asset definition'),
  'SetKeyValue:Nft': metadataBuilder('SetKeyValue', 'Nft', 'NFT'),
  'SetKeyValue:Trigger': metadataBuilder('SetKeyValue', 'Trigger', 'Trigger'),
  'SetKeyValue:Asset': metadataBuilder('SetKeyValue', 'Asset', 'Asset'),
  'RemoveKeyValue:Domain': metadataBuilder('RemoveKeyValue', 'Domain', 'Domain'),
  'RemoveKeyValue:Account': metadataBuilder('RemoveKeyValue', 'Account', 'Account'),
  'RemoveKeyValue:AssetDefinition': metadataBuilder('RemoveKeyValue', 'AssetDefinition', 'Asset definition'),
  'RemoveKeyValue:Nft': metadataBuilder('RemoveKeyValue', 'Nft', 'NFT'),
  'RemoveKeyValue:Trigger': metadataBuilder('RemoveKeyValue', 'Trigger', 'Trigger'),
  'RemoveKeyValue:Asset': metadataBuilder('RemoveKeyValue', 'Asset', 'Asset'),
  'Grant:PermissionToAccount': grantRevokeBuilder(
    'Grant',
    'PermissionToAccount',
    'Account permission grant',
    'Account',
    'account'
  ),
  'Grant:RoleToAccount': grantRevokeBuilder('Grant', 'RoleToAccount', 'Account role grant', 'Account', 'account'),
  'Grant:PermissionToRole': grantRevokeBuilder('Grant', 'PermissionToRole', 'Role permission grant', 'Role', null),
  'Revoke:PermissionFromAccount': grantRevokeBuilder(
    'Revoke',
    'PermissionFromAccount',
    'Account permission revocation',
    'Account',
    'account'
  ),
  'Revoke:RoleFromAccount': grantRevokeBuilder(
    'Revoke',
    'RoleFromAccount',
    'Account role revocation',
    'Account',
    'account'
  ),
  'Revoke:PermissionFromRole': grantRevokeBuilder(
    'Revoke',
    'PermissionFromRole',
    'Role permission revocation',
    'Role',
    null
  ),
  'ExecuteTrigger:ExecuteTrigger': (value) => {
    const parsed = ExecuteTriggerValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'ExecuteTrigger:ExecuteTrigger',
      'ExecuteTrigger',
      'ExecuteTrigger',
      'Trigger execution',
      [field('trigger', 'Trigger', parsed.data.trigger), field('arguments', 'Arguments', parsed.data.args)],
      { primaryKey: 'trigger' }
    );
  },
  'SetParameter:SetParameter': (value) => {
    const parsed = DefinedValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation('SetParameter:SetParameter', 'SetParameter', 'SetParameter', 'Runtime parameter update', [
      field('parameter', 'Parameter', parsed.data),
    ]);
  },
  'Upgrade:ProposeRuntimeUpgrade': (value) => {
    const parsed = RuntimeUpgradeProposalSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'Upgrade:ProposeRuntimeUpgrade',
      'Upgrade',
      'ProposeRuntimeUpgrade',
      'Runtime upgrade proposal',
      [field('manifest-size', 'Manifest bytes', parsed.data.manifest_bytes.length)]
    );
  },
  'Upgrade:ActivateRuntimeUpgrade': (value) => {
    const parsed = RuntimeUpgradeIdSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'Upgrade:ActivateRuntimeUpgrade',
      'Upgrade',
      'ActivateRuntimeUpgrade',
      'Runtime upgrade activation',
      [field('upgrade', 'Upgrade ID', parsed.data.id)],
      { primaryKey: 'upgrade' }
    );
  },
  'Upgrade:CancelRuntimeUpgrade': (value) => {
    const parsed = RuntimeUpgradeIdSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'Upgrade:CancelRuntimeUpgrade',
      'Upgrade',
      'CancelRuntimeUpgrade',
      'Runtime upgrade cancellation',
      [field('upgrade', 'Upgrade ID', parsed.data.id)],
      { primaryKey: 'upgrade' }
    );
  },
  'Upgrade:Upgrade': (value) => {
    const parsed = DefinedValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation('Upgrade:Upgrade', 'Upgrade', 'Upgrade', 'Runtime upgrade', []);
  },
  'Log:Log': (value) => {
    const parsed = LogValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation('Log:Log', 'Log', 'Log', 'Log entry', [
      field('level', 'Level', parsed.data.level),
      field('message', 'Message', parsed.data.msg),
    ]);
  },
  'Shield:Shield': (value) => {
    const parsed = ShieldValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'Shield:Shield',
      'Shield',
      'Shield',
      'Shield operation',
      [
        field('asset', 'Asset definition', parsed.data.asset, 'asset-definition'),
        field('source', 'Source account', parsed.data.from, 'account'),
        field('amount', 'Amount', parsed.data.amount),
        field('commitment', 'Note commitment', parsed.data.note_commitment),
      ],
      { primaryKey: 'asset' }
    );
  },
  'ZkTransfer:ZkTransfer': (value) => {
    const parsed = ZkTransferValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'ZkTransfer:ZkTransfer',
      'ZkTransfer',
      'ZkTransfer',
      'Private transfer',
      [
        field('asset', 'Asset definition', parsed.data.asset, 'asset-definition'),
        field('inputs', 'Input nullifiers', parsed.data.inputs.length),
        field('outputs', 'Output commitments', parsed.data.outputs.length),
      ],
      { primaryKey: 'asset' }
    );
  },
  'Unshield:Unshield': (value) => {
    const parsed = UnshieldValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'Unshield:Unshield',
      'Unshield',
      'Unshield',
      'Unshield operation',
      [
        field('asset', 'Asset definition', parsed.data.asset, 'asset-definition'),
        field('destination', 'Destination account', parsed.data.to, 'account'),
        field('amount', 'Public amount', parsed.data.public_amount),
        field('inputs', 'Input nullifiers', parsed.data.inputs.length),
        field('outputs', 'Change commitments', parsed.data.outputs.length),
      ],
      { primaryKey: 'asset' }
    );
  },
  'KagemushaTopUp:KagemushaTopUp': (value) => {
    const parsed = KagemushaTopUpValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'KagemushaTopUp:KagemushaTopUp',
      'KagemushaTopUp',
      'KagemushaTopUp',
      'Kagemusha top-up',
      [
        field('asset', 'Asset', parsed.data.asset, 'asset'),
        field('amount', 'Atomic amount', parsed.data.amount_atomic_units),
        field('scale', 'Asset scale', parsed.data.asset_scale),
        field('commitment', 'Note commitment', parsed.data.note_commitment),
        field('operation', 'Operation ID', parsed.data.operation_id),
      ],
      { primaryKey: 'asset' }
    );
  },
  'KagemushaRedeem:KagemushaRedeem': (value) => {
    const parsed = KagemushaRedeemValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'KagemushaRedeem:KagemushaRedeem',
      'KagemushaRedeem',
      'KagemushaRedeem',
      'Kagemusha redemption',
      [
        field('asset', 'Asset definition', parsed.data.asset, 'asset-definition'),
        field('recipient', 'Recipient', parsed.data.recipient, 'account'),
        field('amount', 'Atomic amount', parsed.data.amount_atomic_units),
        field('scale', 'Asset scale', parsed.data.asset_scale),
        field('commitment', 'Note commitment', parsed.data.note_commitment),
        field('operation', 'Operation ID', parsed.data.operation_id),
      ],
      { primaryKey: 'asset' }
    );
  },
  'Custom:Register': multisigRegisterBuilder,
  'Custom:Propose': multisigProposeBuilder,
  'Custom:Approve': multisigDecisionBuilder('Approve', 'Multisig approval'),
  'Custom:Cancel': multisigDecisionBuilder('Cancel', 'Multisig cancellation'),
});

export const INSTRUCTION_PRESENTATION_REGISTRY_KEYS = Object.freeze(Object.keys(registry));

const CUSTOM_MULTISIG_VARIANTS = ['Register', 'Propose', 'Approve', 'Cancel'] as const;
const DECODED_BOX_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  Register: ['Peer', 'Domain', 'Account', 'AssetDefinition', 'Nft', 'Role', 'Trigger'],
  Unregister: ['Peer', 'Domain', 'Account', 'AssetDefinition', 'Nft', 'Role', 'Trigger'],
  Mint: ['Asset', 'TriggerRepetitions'],
  Burn: ['Asset', 'TriggerRepetitions'],
  Transfer: ['Domain', 'AssetDefinition', 'Asset', 'Nft', 'AssetBatch'],
  SetKeyValue: ['Domain', 'Account', 'AssetDefinition', 'Nft', 'Trigger', 'Asset'],
  RemoveKeyValue: ['Domain', 'Account', 'AssetDefinition', 'Nft', 'Trigger', 'Asset'],
  Grant: ['PermissionToAccount', 'RoleToAccount', 'PermissionToRole'],
  Revoke: ['PermissionFromAccount', 'RoleFromAccount', 'PermissionFromRole'],
};
const DECODED_DIRECT_VARIANTS: Readonly<Record<string, { family: string; variant: string }>> = {
  ExecuteTrigger: { family: 'ExecuteTrigger', variant: 'ExecuteTrigger' },
  SetParameter: { family: 'SetParameter', variant: 'SetParameter' },
  ProposeRuntimeUpgrade: { family: 'Upgrade', variant: 'ProposeRuntimeUpgrade' },
  ActivateRuntimeUpgrade: { family: 'Upgrade', variant: 'ActivateRuntimeUpgrade' },
  CancelRuntimeUpgrade: { family: 'Upgrade', variant: 'CancelRuntimeUpgrade' },
  Upgrade: { family: 'Upgrade', variant: 'Upgrade' },
  Log: { family: 'Log', variant: 'Log' },
  Shield: { family: 'Shield', variant: 'Shield' },
  ZkTransfer: { family: 'ZkTransfer', variant: 'ZkTransfer' },
  Unshield: { family: 'Unshield', variant: 'Unshield' },
  KagemushaTopUp: { family: 'KagemushaTopUp', variant: 'KagemushaTopUp' },
  KagemushaRedeem: { family: 'KagemushaRedeem', variant: 'KagemushaRedeem' },
};

function buildRegisteredPresentation(
  ...[family, variant, value]: [
    family: string,
    variant: string,
    value: unknown,
  ]
): InstructionPresentation | null {
  return registry[`${family}:${variant}`]?.(value) ?? null;
}

export function buildInstructionPresentation(
  instruction: Pick<Instruction, 'kind' | 'box'>,
  networkPrefix: number
): InstructionPresentation | null {
  requireNetworkPrefix(networkPrefix);
  const payload = ExplorerEnvelopeSchema.safeParse(instruction.box.json.payload);
  if (!payload.success) return null;
  const family = instruction.box.json.kind;

  if (family === 'Custom') {
    if (payload.data.variant !== 'Custom') return null;
    const tagged = exactTaggedValue(payload.data.value, CUSTOM_MULTISIG_VARIANTS);
    if (!tagged) return null;
    return buildRegisteredPresentation('Custom', tagged.variant, tagged.value);
  }

  return buildRegisteredPresentation(family, payload.data.variant, payload.data.value);
}

export function buildDecodedInstructionPresentation(decoded: unknown, networkPrefix: number): InstructionPresentation | null {
  requireNetworkPrefix(networkPrefix);
  return buildDecodedPresentation(decoded);
}

function buildDecodedPresentation(decoded: unknown): InstructionPresentation | null {
  const root = asRecord(decoded);
  if (!root || Object.keys(root).length !== 1) return null;

  if (Object.prototype.hasOwnProperty.call(root, 'Custom')) {
    const custom = asRecord(root.Custom);
    if (!custom || Object.keys(custom).length !== 1 || !Object.prototype.hasOwnProperty.call(custom, 'payload')) return null;
    const tagged = exactTaggedValue(custom.payload, CUSTOM_MULTISIG_VARIANTS);
    if (!tagged) return null;
    return buildRegisteredPresentation('Custom', tagged.variant, tagged.value);
  }

  for (const [family, variants] of Object.entries(DECODED_BOX_VARIANTS)) {
    if (!Object.prototype.hasOwnProperty.call(root, family)) continue;
    const tagged = exactTaggedValue(root[family], variants);
    if (!tagged) return null;
    return buildRegisteredPresentation(family, tagged.variant, tagged.value);
  }

  for (const [rootVariant, target] of Object.entries(DECODED_DIRECT_VARIANTS)) {
    if (!Object.prototype.hasOwnProperty.call(root, rootVariant)) continue;
    return buildRegisteredPresentation(target.family, target.variant, root[rootVariant]);
  }

  return null;
}
