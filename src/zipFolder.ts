import JSZip from 'jszip';

export interface ZipResult {
  file: File;
  folderName: string;
}

async function toZipFile(zip: JSZip, folderName: string): Promise<ZipResult> {
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { file: new File([blob], `${folderName}.zip`, { type: 'application/zip' }), folderName };
}

// <input webkitdirectory> — files already carry webkitRelativePath
export async function zipInputFolder(files: File[]): Promise<ZipResult> {
  const zip = new JSZip();
  const folderName = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || 'folder';
  for (const f of files) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    zip.file(path, f);
  }
  return toZipFile(zip, folderName);
}

// Drag-and-drop directory entry — traverse recursively
export async function zipDirEntry(entry: FileSystemDirectoryEntry): Promise<ZipResult> {
  const zip = new JSZip();

  async function walk(e: FileSystemEntry, path: string): Promise<void> {
    if (e.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (e as FileSystemFileEntry).file(resolve, reject)
      );
      zip.file(path, file);
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject)
        );
        for (const child of batch) await walk(child, path + '/' + child.name);
      } while (batch.length > 0);
    }
  }

  await walk(entry, entry.name);
  return toZipFile(zip, entry.name);
}

// Extract regular files and directory entries from a DataTransfer
export function extractDropItems(dt: DataTransfer): {
  files: File[];
  dirEntries: FileSystemDirectoryEntry[];
} {
  const files: File[] = [];
  const dirEntries: FileSystemDirectoryEntry[] = [];
  const dtItems = Array.from(dt.items || []);

  if (dtItems.length && typeof dtItems[0].webkitGetAsEntry === 'function') {
    for (const item of dtItems) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        dirEntries.push(entry as FileSystemDirectoryEntry);
      } else {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  } else {
    files.push(...Array.from(dt.files || []));
  }

  return { files, dirEntries };
}
