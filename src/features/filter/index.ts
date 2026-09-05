export type TabItem<T = string> = {
  value: T
} & (
  | { i18nKey: string, label?: never }
  | { label: string, i18nKey?: never }
);
