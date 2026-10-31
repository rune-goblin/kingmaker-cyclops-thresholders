declare module '@foundryvtt/foundryvtt-cli' {
  export function extractPack(
    src: string,
    dest: string,
    options?: { documentType?: string; transformEntry?: (doc: never) => unknown },
  ): Promise<void>;
}
