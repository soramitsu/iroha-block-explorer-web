import type { InstructionKind, TransactionStatus } from '@/shared/api/schemas';
import type { TabItem } from '../index';

export type Status = TransactionStatus | null;
export type TabAccountTransactions = 'transactions' | 'instructions' | 'tracing';
export type TabInstructions = 'All' | InstructionKind;

export const ACCOUNT_TRANSACTIONS_OPTIONS: TabItem<TabAccountTransactions>[] = [
  { i18nKey: 'transactions.transactions', value: 'transactions' },
  { i18nKey: 'transactions.instructions', value: 'instructions' },
  { i18nKey: 'tracing.nav', value: 'tracing' },
];

export const INSTRUCTION_OPTIONS: TabItem<TabInstructions>[] = [
  { i18nKey: 'transactions.all', value: 'All' },
  { i18nKey: 'transactions.register', value: 'Register' },
  { i18nKey: 'transactions.unregister', value: 'Unregister' },
  { i18nKey: 'transactions.mints', value: 'Mint' },
  { i18nKey: 'transactions.burns', value: 'Burn' },
  { i18nKey: 'transactions.transfers', value: 'Transfer' },
  { i18nKey: 'transactions.setKeyValue', value: 'SetKeyValue' },
  { i18nKey: 'transactions.removeKeyValue', value: 'RemoveKeyValue' },
  { i18nKey: 'transactions.grants', value: 'Grant' },
  { i18nKey: 'transactions.revokes', value: 'Revoke' },
  { i18nKey: 'transactions.executeTrigger', value: 'ExecuteTrigger' },
  { i18nKey: 'transactions.setParameter', value: 'SetParameter' },
  { i18nKey: 'transactions.upgrade', value: 'Upgrade' },
  { i18nKey: 'transactions.log', value: 'Log' },
  { i18nKey: 'transactions.custom', value: 'Custom' },
];
