export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  contentType: string;
}

export interface ListResult {
  objects: StorageObject[];
  prefixes: string[];
}
