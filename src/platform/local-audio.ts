import { localAudioFileSchema, MAX_AUDIO_FILE_BYTES, type LocalAudioFile } from '../domain/model';

const DATABASE = 'little-shift-audio';
const STORE = 'files';
type AudioRecord = { id: string; blob: Blob };

export function validateLocalAudio(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (!file.size) throw new Error('File âm thanh trống. Hãy chọn file khác.');
  if (file.size > MAX_AUDIO_FILE_BYTES) throw new Error('File âm thanh tối đa 25 MB.');
  if (
    !file.type.startsWith('audio/') &&
    file.type !== 'application/ogg' &&
    !/\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i.test(file.name)
  )
    throw new Error(
      'Hãy chọn file âm thanh MP3, WAV, OGG hoặc định dạng audio được trình duyệt hỗ trợ.',
    );
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Không mở được bộ nhớ file âm thanh trên thiết bị.'));
  });
}
async function access<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () =>
        reject(
          new Error(
            transaction.error?.name === 'QuotaExceededError'
              ? 'Không đủ bộ nhớ để lưu file âm thanh. Hãy chọn file nhỏ hơn.'
              : 'Không thể đọc hoặc lưu file âm thanh. Hãy thử lại.',
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function saveLocalAudio(file: File): Promise<LocalAudioFile> {
  validateLocalAudio(file);
  const metadata = localAudioFileSchema.parse({
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    size: file.size,
  });
  await access('readwrite', (store) =>
    store.put({ id: metadata.id, blob: file } satisfies AudioRecord),
  );
  return metadata;
}
export async function loadLocalAudio(id: string): Promise<Blob> {
  const record = await access<AudioRecord | undefined>('readonly', (store) => store.get(id));
  if (!record?.blob || !(record.blob instanceof Blob))
    throw new Error('File âm thanh không còn trên thiết bị. Hãy chọn lại file trong Cài đặt.');
  return record.blob;
}
export async function removeLocalAudio(id: string) {
  await access('readwrite', (store) => store.delete(id));
}
export async function clearLocalAudio() {
  await access('readwrite', (store) => store.clear());
}
