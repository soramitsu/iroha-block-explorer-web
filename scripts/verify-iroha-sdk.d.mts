export const IROHA_SDK_SPECIFIER: string;
export const IROHA_SDK_ARCHIVE_SHA256: string;
export const IROHA_SDK_INVENTORY_SHA256: string;
export const IROHA_SDK_SOURCE_REVISION: string;

interface SdkIntegrityResult {
  files: number;
  archiveSha256: string;
  inventorySha256: string;
}

export function verifyIrohaSdkArchive(repositoryRoot: string): Promise<SdkIntegrityResult & {
  status: 'archive-integrity-verified';
}>;

export function verifyIrohaSdk(repositoryRoot: string): Promise<SdkIntegrityResult & {
  status: 'package-integrity-verified';
}>;
