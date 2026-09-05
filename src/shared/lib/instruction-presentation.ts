import { z } from 'zod';
import type { Instruction } from '@/shared/api/schemas';
import {
  AccountIdSchema,
  AssetDefinitionIdSchema,
  AssetDefinitionSelectorSchema,
  AssetIdSchema,
  NftIdSchema,
} from '@/shared/api/schemas';
import { normalizeDomainIdLiteral } from '@/shared/lib/rwa-id';
import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';
import { buildMultisigCustomDisplayPayload } from '@/shared/lib/multisig-custom';

type AnyRecord = Record<string, unknown>;
type PresentationBuilder = (value: unknown, rawPayload: unknown) => InstructionPresentation | null;
type EntityRouteKind = 'account' | 'asset' | 'asset-definition' | 'domain' | 'nft';

export interface InstructionPresentationField {
  key: string;
  label: InstructionPresentationMessage;
  value: string;
  link: string | null;
}

export interface InstructionPresentationMessage {
  key: string;
  params?: Readonly<Record<string, string | number>>;
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
  kindLabel: InstructionPresentationMessage | null;
  title: InstructionPresentationMessage;
  fields: InstructionPresentationField[];
  primaryEntity: InstructionPresentationField | null;
  nestedInstructions: NestedInstructionPresentation[];
}

const AnyRecordSchema = z.record(z.string(), z.unknown());
const NonEmptyStringSchema = z.string().min(1);
const QuantityStringSchema = z
  .string()
  .max(160)
  .superRefine((value, ctx) => {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{0,27}[1-9])?$/u.test(value)) {
      ctx.addIssue({ code: 'custom' });
      return;
    }
    const [integer, fraction = ''] = value.split('.');
    if (BigInt(`${integer}${fraction}`) > (1n << 511n) - 1n) {
      ctx.addIssue({ code: 'custom' });
    }
  });
const PositiveAtomicUnitsSchema = z.string().regex(/^[1-9]\d*$/u);
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const U8Schema = NonNegativeIntegerSchema.max(0xff);
const U32Schema = NonNegativeIntegerSchema.max(0xffff_ffff);
const LowerHex32Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const CanonicalHashLiteralSchema = z
  .string()
  .regex(/^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u)
  .refine((value) => normalizeIrohaHash32(value) !== null);
const NameSchema = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      new TextEncoder().encode(value).length <= 255 &&
      value.normalize('NFC') === value &&
      !/[\s@#$\p{Cc}]/u.test(value) &&
      !/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
const DomainIdSchema = z.string().refine((value) => normalizeDomainIdLiteral(value) === value);
const ExactAccountIdSchema = z.string().refine((value) => AccountIdSchema.safeParse(value).data === value);
const ExactAssetDefinitionIdSchema = z
  .string()
  .refine((value) => AssetDefinitionIdSchema.safeParse(value).data === value);
const ExactAssetIdSchema = z.string().refine((value) => AssetIdSchema.safeParse(value).data === value);
const ExactNftIdSchema = z.string().refine((value) => NftIdSchema.safeParse(value).data === value);
const ExplorerEnvelopeSchema = z
  .object({
    variant: NonEmptyStringSchema,
    value: z.unknown(),
  })
  .strict();

const UnregisterValueSchema = z.object({ object: NonEmptyStringSchema }).strict();
const QuantityDestinationSchema = z
  .object({
    object: QuantityStringSchema,
    destination: ExactAssetIdSchema,
  })
  .strict();
const RepetitionDestinationSchema = z
  .object({
    object: U32Schema,
    destination: NameSchema,
  })
  .strict();
const AccountOwnedTransferValueSchema = z
  .object({
    source: ExactAccountIdSchema,
    object: NonEmptyStringSchema,
    destination: ExactAccountIdSchema,
  })
  .strict();
const AssetTransferValueSchema = z
  .object({
    source: ExactAssetIdSchema,
    object: QuantityStringSchema,
    destination: ExactAccountIdSchema,
  })
  .strict();
const AssetBatchModeSchema = z
  .object({
    mode: z.enum(['Atomic', 'Independent']),
    value: z.null(),
  })
  .strict();
const AssetBatchValueSchema = z
  .object({
    mode: AssetBatchModeSchema,
    entries: z
      .array(
        z
          .object({
            leg_id: z.string(),
            from: ExactAccountIdSchema,
            to: ExactAccountIdSchema,
            asset_definition: ExactAssetDefinitionIdSchema,
            amount: QuantityStringSchema,
          })
          .strict()
      )
      .min(1),
  })
  .strict();
const MetadataValueSchema = z
  .object({
    object: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
    value: z.json(),
  })
  .strict();
const AssetMetadataValueSchema = z
  .object({
    asset: ExactAssetIdSchema,
    key: NonEmptyStringSchema,
    value: z.json(),
  })
  .strict();
const MetadataRemovalSchema = z
  .object({
    object: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
  })
  .strict();
const AssetMetadataRemovalSchema = z
  .object({
    asset: ExactAssetIdSchema,
    key: NonEmptyStringSchema,
  })
  .strict();
const GrantRevokeValueSchema = z
  .object({
    object: z.unknown(),
    destination: z.string(),
  })
  .strict();
const PermissionSchema = z.object({ name: NonEmptyStringSchema, payload: z.json() }).strict();
const ExecuteTriggerValueSchema = z
  .object({
    trigger: NameSchema,
    args: z.json(),
  })
  .strict();
const RuntimeUpgradeProposalSchema = z.object({ manifest_bytes: z.array(U8Schema) }).strict();
const LogValueSchema = z
  .object({
    level: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']),
    msg: z.string(),
  })
  .strict();
const KagemushaTopUpValueSchema = z
  .object({
    asset: ExactAssetDefinitionIdSchema,
    amount_atomic_units: PositiveAtomicUnitsSchema,
    asset_scale: U8Schema,
    note_commitment: LowerHex32Schema,
    operation_id: LowerHex32Schema,
  })
  .strict();
const KagemushaRedeemValueSchema = KagemushaTopUpValueSchema.extend({
  recipient: ExactAccountIdSchema,
}).strict();
const MultisigRegisterSchema = z
  .object({
    account: ExactAccountIdSchema,
    home_domain: DomainIdSchema.nullable(),
    spec: z
      .object({
        signatories: z.record(ExactAccountIdSchema, U8Schema),
        quorum: z.number().int().min(1).max(0xffff),
        transaction_ttl_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  })
  .strict();
const MultisigProposeSchema = z
  .object({
    account: ExactAccountIdSchema,
    instructions: z.array(z.string().min(1)),
    transaction_ttl_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .strict();
const MultisigDecisionSchema = z
  .object({
    account: ExactAccountIdSchema,
    instructions_hash: CanonicalHashLiteralSchema,
  })
  .strict();
const MultisigInvalidateOutstandingSchema = z
  .object({
    account: ExactAccountIdSchema,
  })
  .strict();

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
    const parsed = AccountIdSchema.safeParse(value);
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
  ...[key, label, value, entityKind = null, params]: [
    key: string,
    label: string,
    value: unknown,
    entityKind?: EntityRouteKind | null,
    params?: Readonly<Record<string, string | number>>,
  ]
) {
  const text = compactJson(value);
  return {
    key,
    label: message(`fields.${label}`, params),
    value: text,
    link: entityRoute(entityKind, text),
  } satisfies InstructionPresentationField;
}

function message(key: string, params?: Readonly<Record<string, string | number>>): InstructionPresentationMessage {
  return {
    key: `studio.instructionPresentation.${key}`,
    ...(params ? { params } : {}),
  };
}

function titleKey(registryKey: string): InstructionPresentationMessage {
  return message(`titles.${registryKey.replace(':', '_')}`);
}

function presentation(
  ...[registryKey, family, variant, fields, options = {}]: [
    registryKey: string,
    family: string,
    variant: string,
    fields: InstructionPresentationField[],
    options?: {
      kindLabel?: InstructionPresentationMessage;
      primaryKey?: string;
      nestedInstructions?: NestedInstructionPresentation[];
    },
  ]
): InstructionPresentation {
  return {
    registryKey,
    family,
    variant,
    kindLabel: options.kindLabel ?? null,
    title: titleKey(registryKey),
    fields,
    primaryEntity: options.primaryKey
      ? (fields.find((candidate) => candidate.key === options.primaryKey) ?? null)
      : null,
    nestedInstructions: options.nestedInstructions ?? [],
  };
}

function isExactEntityId(variant: string, value: string): boolean {
  if (variant === 'Domain') return DomainIdSchema.safeParse(value).success;
  if (variant === 'Account') return ExactAccountIdSchema.safeParse(value).success;
  if (variant === 'AssetDefinition') return ExactAssetDefinitionIdSchema.safeParse(value).success;
  if (variant === 'Nft') return ExactNftIdSchema.safeParse(value).success;
  if (variant === 'Role' || variant === 'Trigger') return NameSchema.safeParse(value).success;
  return false;
}

function unregisterBuilder(variant: string, noun: string): PresentationBuilder {
  return (value) => {
    const parsed = UnregisterValueSchema.safeParse(value);
    if (!parsed.success || !isExactEntityId(variant, parsed.data.object)) return null;
    return presentation(
      `Unregister:${variant}`,
      'Unregister',
      variant,
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
      [field('amount', 'amount', parsed.data.object), field('asset', 'asset', parsed.data.destination, 'asset')],
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
      [field('repetitions', 'repetitions', parsed.data.object), field('trigger', 'trigger', parsed.data.destination)],
      { primaryKey: 'trigger' }
    );
  };
}

function transferBuilder(variant: 'Domain' | 'AssetDefinition' | 'Asset' | 'Nft', noun: string): PresentationBuilder {
  return (value) => {
    if (variant === 'Asset') {
      const parsed = AssetTransferValueSchema.safeParse(value);
      if (!parsed.success) return null;
      return presentation(
        'Transfer:Asset',
        'Transfer',
        'Asset',
        [
          field('source', 'asset', parsed.data.source, 'asset'),
          field('amount', 'amount', parsed.data.object),
          field('destination', 'destination', parsed.data.destination, 'account'),
        ],
        { primaryKey: 'source' }
      );
    }

    const parsed = AccountOwnedTransferValueSchema.safeParse(value);
    if (!parsed.success || !isExactEntityId(variant, parsed.data.object)) return null;

    return presentation(
      `Transfer:${variant}`,
      'Transfer',
      variant,
      [
        field('source', 'source', parsed.data.source, 'account'),
        field('object', noun, parsed.data.object, variantEntityKinds[variant] ?? null),
        field('destination', 'destination', parsed.data.destination, 'account'),
      ],
      { primaryKey: 'object' }
    );
  };
}

function assetBatchBuilder(value: unknown): InstructionPresentation | null {
  const parsed = AssetBatchValueSchema.safeParse(value);
  if (!parsed.success) return null;
  const fields: InstructionPresentationField[] = [
    field('mode', 'mode', parsed.data.mode.mode),
    field('entries', 'entries', parsed.data.entries.length),
  ];
  parsed.data.entries.forEach((entry, index) => {
    const suffix = index + 1;
    fields.push(
      field(`asset-${index}`, 'indexedAsset', entry.asset_definition, 'asset-definition', { index: suffix }),
      field(`leg-${index}`, 'indexedLeg', entry.leg_id, null, { index: suffix }),
      field(`amount-${index}`, 'indexedAmount', entry.amount, null, { index: suffix }),
      field(`source-${index}`, 'indexedSource', entry.from, 'account', { index: suffix }),
      field(`destination-${index}`, 'indexedDestination', entry.to, 'account', { index: suffix })
    );
  });
  return presentation('Transfer:AssetBatch', 'Transfer', 'AssetBatch', fields, {
    primaryKey: 'asset-0',
  });
}

function metadataBuilder(family: 'SetKeyValue' | 'RemoveKeyValue', variant: string, noun: string): PresentationBuilder {
  return (value) => {
    const isAsset = variant === 'Asset';
    if (family === 'SetKeyValue') {
      if (isAsset) {
        const parsed = AssetMetadataValueSchema.safeParse(value);
        if (!parsed.success) return null;
        return presentation(
          `${family}:${variant}`,
          family,
          variant,
          [
            field('target', noun, parsed.data.asset, 'asset'),
            field('key', 'key', parsed.data.key),
            field('value', 'value', parsed.data.value),
          ],
          { primaryKey: 'target' }
        );
      }

      const parsed = MetadataValueSchema.safeParse(value);
      if (!parsed.success || !isExactEntityId(variant, parsed.data.object)) return null;
      return presentation(
        `${family}:${variant}`,
        family,
        variant,
        [
          field('target', noun, parsed.data.object, variantEntityKinds[variant] ?? null),
          field('key', 'key', parsed.data.key),
          field('value', 'value', parsed.data.value),
        ],
        { primaryKey: 'target' }
      );
    }

    if (isAsset) {
      const parsed = AssetMetadataRemovalSchema.safeParse(value);
      if (!parsed.success) return null;
      return presentation(
        `${family}:${variant}`,
        family,
        variant,
        [field('target', noun, parsed.data.asset, 'asset'), field('key', 'key', parsed.data.key)],
        { primaryKey: 'target' }
      );
    }

    const parsed = MetadataRemovalSchema.safeParse(value);
    if (!parsed.success || !isExactEntityId(variant, parsed.data.object)) return null;
    return presentation(
      `${family}:${variant}`,
      family,
      variant,
      [
        field('target', noun, parsed.data.object, variantEntityKinds[variant] ?? null),
        field('key', 'key', parsed.data.key),
      ],
      { primaryKey: 'target' }
    );
  };
}

function grantRevokeBuilder(
  ...[family, variant, destinationLabel, destinationKind]: [
    family: 'Grant' | 'Revoke',
    variant: string,
    destinationLabel: string,
    destinationKind: EntityRouteKind | null,
  ]
): PresentationBuilder {
  return (value) => {
    const parsed = GrantRevokeValueSchema.safeParse(value);
    if (!parsed.success) return null;
    const isRoleObject = variant.includes('RoleTo') || variant.includes('RoleFrom');
    const object = isRoleObject
      ? NameSchema.safeParse(parsed.data.object)
      : PermissionSchema.safeParse(parsed.data.object);
    const destination =
      destinationKind === 'account'
        ? ExactAccountIdSchema.safeParse(parsed.data.destination)
        : NameSchema.safeParse(parsed.data.destination);
    if (!object.success || !destination.success) return null;
    return presentation(
      `${family}:${variant}`,
      family,
      variant,
      [
        field('object', isRoleObject ? 'role' : 'permission', object.data),
        field('destination', destinationLabel, destination.data, destinationKind),
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
    field('account', 'registrationAccount', parsed.data.account, 'account'),
    field('quorum', 'quorum', parsed.data.spec.quorum),
    field('ttl', 'defaultTtlMs', parsed.data.spec.transaction_ttl_ms),
    field('signatories', 'signatories', Object.keys(parsed.data.spec.signatories).length),
  ];
  if (parsed.data.home_domain) {
    fields.push(field('home-domain', 'homeDomain', parsed.data.home_domain, 'domain'));
  }
  Object.entries(parsed.data.spec.signatories).forEach(([account, weight], index) => {
    fields.push(field(`signatory-${index}`, 'indexedSignatory', account, 'account', { index: index + 1, weight }));
  });
  return presentation('Custom:Register', 'Custom', 'Register', fields, {
    kindLabel: message('kinds.multisig'),
    primaryKey: 'account',
  });
}

function multisigProposeBuilder(value: unknown, rawPayload: unknown): InstructionPresentation | null {
  const parsed = MultisigProposeSchema.safeParse(value);
  if (!parsed.success) return null;
  const decoded = buildMultisigCustomDisplayPayload(rawPayload);
  if (!decoded || decoded.multisig.variant !== 'Propose') return null;
  const nestedInstructions = decoded.multisig.decoded_instructions.map((instruction, index) => ({
    index: instruction.index,
    encoded: parsed.data.instructions[index] ?? '',
    presentation: buildDecodedInstructionPresentation(instruction.instruction),
  }));
  const fields = [
    field('account', 'multisigAccount', parsed.data.account, 'account'),
    field('instructions', 'proposedInstructions', parsed.data.instructions.length),
  ];
  if (parsed.data.transaction_ttl_ms !== null) {
    fields.push(field('ttl', 'proposalTtlMs', parsed.data.transaction_ttl_ms));
  }
  return presentation('Custom:Propose', 'Custom', 'Propose', fields, {
    kindLabel: message('kinds.multisig'),
    primaryKey: 'account',
    nestedInstructions,
  });
}

function multisigDecisionBuilder(variant: 'Approve' | 'Cancel'): PresentationBuilder {
  return (value) => {
    const parsed = MultisigDecisionSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      `Custom:${variant}`,
      'Custom',
      variant,
      [
        field('account', 'multisigAccount', parsed.data.account, 'account'),
        field('hash', 'instructionsHash', parsed.data.instructions_hash),
      ],
      { kindLabel: message('kinds.multisig'), primaryKey: 'account' }
    );
  };
}

function multisigInvalidateOutstandingBuilder(value: unknown): InstructionPresentation | null {
  const parsed = MultisigInvalidateOutstandingSchema.safeParse(value);
  if (!parsed.success) return null;
  return presentation(
    'Custom:InvalidateOutstanding',
    'Custom',
    'InvalidateOutstanding',
    [field('account', 'multisigAccount', parsed.data.account, 'account')],
    { kindLabel: message('kinds.multisig'), primaryKey: 'account' }
  );
}

const registry: Readonly<Record<string, PresentationBuilder>> = Object.freeze({
  'Unregister:Domain': unregisterBuilder('Domain', 'domain'),
  'Unregister:Account': unregisterBuilder('Account', 'account'),
  'Unregister:AssetDefinition': unregisterBuilder('AssetDefinition', 'assetDefinition'),
  'Unregister:Nft': unregisterBuilder('Nft', 'nft'),
  'Unregister:Role': unregisterBuilder('Role', 'role'),
  'Unregister:Trigger': unregisterBuilder('Trigger', 'trigger'),
  'Mint:Asset': assetQuantityBuilder('Mint'),
  'Mint:TriggerRepetitions': triggerRepetitionBuilder('Mint'),
  'Burn:Asset': assetQuantityBuilder('Burn'),
  'Burn:TriggerRepetitions': triggerRepetitionBuilder('Burn'),
  'Transfer:Domain': transferBuilder('Domain', 'domain'),
  'Transfer:AssetDefinition': transferBuilder('AssetDefinition', 'assetDefinition'),
  'Transfer:Asset': transferBuilder('Asset', 'asset'),
  'Transfer:Nft': transferBuilder('Nft', 'nft'),
  'Transfer:AssetBatch': assetBatchBuilder,
  'SetKeyValue:Domain': metadataBuilder('SetKeyValue', 'Domain', 'domain'),
  'SetKeyValue:Account': metadataBuilder('SetKeyValue', 'Account', 'account'),
  'SetKeyValue:AssetDefinition': metadataBuilder('SetKeyValue', 'AssetDefinition', 'assetDefinition'),
  'SetKeyValue:Nft': metadataBuilder('SetKeyValue', 'Nft', 'nft'),
  'SetKeyValue:Trigger': metadataBuilder('SetKeyValue', 'Trigger', 'trigger'),
  'SetKeyValue:Asset': metadataBuilder('SetKeyValue', 'Asset', 'asset'),
  'RemoveKeyValue:Domain': metadataBuilder('RemoveKeyValue', 'Domain', 'domain'),
  'RemoveKeyValue:Account': metadataBuilder('RemoveKeyValue', 'Account', 'account'),
  'RemoveKeyValue:AssetDefinition': metadataBuilder('RemoveKeyValue', 'AssetDefinition', 'assetDefinition'),
  'RemoveKeyValue:Nft': metadataBuilder('RemoveKeyValue', 'Nft', 'nft'),
  'RemoveKeyValue:Trigger': metadataBuilder('RemoveKeyValue', 'Trigger', 'trigger'),
  'RemoveKeyValue:Asset': metadataBuilder('RemoveKeyValue', 'Asset', 'asset'),
  'Grant:PermissionToAccount': grantRevokeBuilder('Grant', 'PermissionToAccount', 'account', 'account'),
  'Grant:RoleToAccount': grantRevokeBuilder('Grant', 'RoleToAccount', 'account', 'account'),
  'Grant:PermissionToRole': grantRevokeBuilder('Grant', 'PermissionToRole', 'role', null),
  'Revoke:PermissionFromAccount': grantRevokeBuilder('Revoke', 'PermissionFromAccount', 'account', 'account'),
  'Revoke:RoleFromAccount': grantRevokeBuilder('Revoke', 'RoleFromAccount', 'account', 'account'),
  'Revoke:PermissionFromRole': grantRevokeBuilder('Revoke', 'PermissionFromRole', 'role', null),
  'ExecuteTrigger:ExecuteTrigger': (value) => {
    const parsed = ExecuteTriggerValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'ExecuteTrigger:ExecuteTrigger',
      'ExecuteTrigger',
      'ExecuteTrigger',
      [field('trigger', 'trigger', parsed.data.trigger), field('arguments', 'arguments', parsed.data.args)],
      { primaryKey: 'trigger' }
    );
  },
  'Upgrade:ProposeRuntimeUpgrade': (value) => {
    const parsed = RuntimeUpgradeProposalSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation('Upgrade:ProposeRuntimeUpgrade', 'Upgrade', 'ProposeRuntimeUpgrade', [
      field('manifest-size', 'manifestBytes', parsed.data.manifest_bytes.length),
    ]);
  },
  'Log:Log': (value) => {
    const parsed = LogValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation('Log:Log', 'Log', 'Log', [
      field('level', 'level', parsed.data.level),
      field('message', 'message', parsed.data.msg),
    ]);
  },
  'KagemushaTopUp:KagemushaTopUp': (value) => {
    const parsed = KagemushaTopUpValueSchema.safeParse(value);
    if (!parsed.success) return null;
    return presentation(
      'KagemushaTopUp:KagemushaTopUp',
      'KagemushaTopUp',
      'KagemushaTopUp',
      [
        field('asset', 'assetDefinition', parsed.data.asset, 'asset-definition'),
        field('amount', 'atomicAmount', parsed.data.amount_atomic_units),
        field('scale', 'assetScale', parsed.data.asset_scale),
        field('commitment', 'noteCommitment', parsed.data.note_commitment),
        field('operation', 'operationId', parsed.data.operation_id),
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
      [
        field('asset', 'assetDefinition', parsed.data.asset, 'asset-definition'),
        field('recipient', 'recipient', parsed.data.recipient, 'account'),
        field('amount', 'atomicAmount', parsed.data.amount_atomic_units),
        field('scale', 'assetScale', parsed.data.asset_scale),
        field('commitment', 'noteCommitment', parsed.data.note_commitment),
        field('operation', 'operationId', parsed.data.operation_id),
      ],
      { primaryKey: 'asset' }
    );
  },
  'Custom:Register': multisigRegisterBuilder,
  'Custom:Propose': multisigProposeBuilder,
  'Custom:Approve': multisigDecisionBuilder('Approve'),
  'Custom:Cancel': multisigDecisionBuilder('Cancel'),
  'Custom:InvalidateOutstanding': multisigInvalidateOutstandingBuilder,
});

export const INSTRUCTION_PRESENTATION_REGISTRY_KEYS = Object.freeze(Object.keys(registry));

const CUSTOM_MULTISIG_VARIANTS = ['Register', 'Propose', 'Approve', 'Cancel', 'InvalidateOutstanding'] as const;
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
  ProposeRuntimeUpgrade: { family: 'Upgrade', variant: 'ProposeRuntimeUpgrade' },
  Log: { family: 'Log', variant: 'Log' },
  KagemushaTopUp: { family: 'KagemushaTopUp', variant: 'KagemushaTopUp' },
  KagemushaRedeem: { family: 'KagemushaRedeem', variant: 'KagemushaRedeem' },
};

function buildRegisteredPresentation(
  ...[family, variant, value, rawPayload]: [family: string, variant: string, value: unknown, rawPayload: unknown]
): InstructionPresentation | null {
  return registry[`${family}:${variant}`]?.(value, rawPayload) ?? null;
}

export function buildInstructionPresentation(
  instruction: Pick<Instruction, 'kind' | 'box'>
): InstructionPresentation | null {
  const payload = ExplorerEnvelopeSchema.safeParse(instruction.box.json.payload);
  if (!payload.success) return null;
  const family = instruction.box.json.kind;

  if (family === 'Custom') {
    if (payload.data.variant !== 'Custom') return null;
    const tagged = exactTaggedValue(payload.data.value, CUSTOM_MULTISIG_VARIANTS);
    if (!tagged) return null;
    return buildRegisteredPresentation('Custom', tagged.variant, tagged.value, payload.data);
  }

  return buildRegisteredPresentation(family, payload.data.variant, payload.data.value, payload.data);
}

export function buildDecodedInstructionPresentation(decoded: unknown): InstructionPresentation | null {
  const root = asRecord(decoded);
  if (!root || Object.keys(root).length !== 1) return null;

  for (const [family, variants] of Object.entries(DECODED_BOX_VARIANTS)) {
    if (!Object.prototype.hasOwnProperty.call(root, family)) continue;
    const tagged = exactTaggedValue(root[family], variants);
    if (!tagged) return null;
    return buildRegisteredPresentation(family, tagged.variant, tagged.value, {
      variant: tagged.variant,
      value: tagged.value,
    });
  }

  for (const [rootVariant, target] of Object.entries(DECODED_DIRECT_VARIANTS)) {
    if (!Object.prototype.hasOwnProperty.call(root, rootVariant)) continue;
    return buildRegisteredPresentation(target.family, target.variant, root[rootVariant], {
      variant: target.variant,
      value: root[rootVariant],
    });
  }

  return null;
}
