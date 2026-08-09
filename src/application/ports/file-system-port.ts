/** Defines the smallest filesystem read boundary needed by future composition. */
interface FileSystemPort {
  /** Reads one UTF-8 text file without interpreting its contents. */
  readTextFile(filePath: string): Promise<string>;
}

export type { FileSystemPort };
