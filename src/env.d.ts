/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

export interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_FAKE_API_ENABLED?: 'TRUE' | 'FALSE'
}

export interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '@soramitsu-ui/icons/*' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
