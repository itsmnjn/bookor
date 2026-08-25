const DATABASE_NAME = "bookor"
const DATABASE_VERSION = 1

export const PROJECTS_STORE = "projects"
export const CUSTOM_PRESETS_STORE = "customPresets"

type BookorStore = typeof PROJECTS_STORE | typeof CUSTOM_PRESETS_STORE

let databasePromise: Promise<IDBDatabase> | null = null

export function getAllRecords<T>(storeName: BookorStore): Promise<T[]> {
  return withStore(storeName, "readonly", (store) => requestToPromise(store.getAll()))
}

export function putRecords<T>(storeName: BookorStore, records: T[]): Promise<void> {
  if (records.length === 0) return Promise.resolve()

  return withStore(storeName, "readwrite", async (store) => {
    for (const record of records) {
      await requestToPromise(store.put(record))
    }
  })
}

export function deleteRecord(storeName: BookorStore, id: string): Promise<void> {
  return withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.delete(id))
  })
}

async function withStore<T>(
  storeName: BookorStore,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, mode)
  const completion = transactionToPromise(transaction)
  const result = await operation(transaction.objectStore(storeName))
  await completion
  return result
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: "id" })
      }
      if (!database.objectStoreNames.contains(CUSTOM_PRESETS_STORE)) {
        database.createObjectStore(CUSTOM_PRESETS_STORE, { keyPath: "id" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Could not open Bookor storage."))
  })

  return databasePromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Bookor storage request failed."))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Bookor storage transaction failed."))
    transaction.onabort = () => reject(transaction.error ?? new Error("Bookor storage transaction was aborted."))
  })
}
