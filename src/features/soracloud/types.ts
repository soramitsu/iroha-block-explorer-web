export interface SoracloudSectionState<Query, Data> {
  activeQuery: Query | null
  error: string | null
  ready: boolean
  isLoading: boolean
  data: Data | undefined
  refetch: () => void
  apply: (query: Query) => boolean
}

export interface SoracloudOverviewCard {
  key: string
  label: string
  value: string
}

export type SoracloudValidationError =
  | 'invalidAccountId'
  | 'invalidLeaseTermMs'
  | 'invalidHex';

export interface SoracloudParsedField<T> {
  value: T | undefined
  error: SoracloudValidationError | null
}
