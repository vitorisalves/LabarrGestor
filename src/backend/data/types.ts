export interface DocData { [k: string]: any }
export interface DocSnapshot { id: string; data(): DocData; exists(): boolean }
export interface QuerySnapshot { docs: DocSnapshot[]; empty: boolean }
export interface DocRef { __coll: string; __id: string; __local?: boolean }
export interface DataRepo {
  collection(coll: string): Promise<any>;
  getDocs(coll: string, path?: string, forceNoCache?: boolean): Promise<QuerySnapshot>;
  getDocsWithLimit(coll: string, limitCount: number, forceNoCache?: boolean): Promise<QuerySnapshot>;
  getDoc(ref: DocRef | Promise<DocRef>, path?: string, forceNoCache?: boolean): Promise<DocSnapshot>;
  doc(coll: string, id: string): Promise<DocRef>;
  set(ref: DocRef | Promise<DocRef>, data: DocData, path?: string): Promise<void>;
  update(ref: DocRef | Promise<DocRef>, data: DocData, path?: string): Promise<void>;
  delete(ref: DocRef | Promise<DocRef>, path?: string): Promise<void>;
  invalidateCache(path: string): void;
  getCollectionVersion(path: string): number;
  getPendingReminders(nowIso: string): Promise<QuerySnapshot>;
}
