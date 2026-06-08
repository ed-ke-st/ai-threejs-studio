import fs from "node:fs/promises";
import path from "node:path";

interface ZipFileEntry {
  path: string;
  data: Buffer;
  mtime: Date;
}

interface ZipDirectoryOptions {
  rootFolder: string;
  exclude?: string[];
}

interface CentralDirectoryRecord {
  fileName: Buffer;
  crc: number;
  size: number;
  dosTime: number;
  dosDate: number;
  offset: number;
}

const crcTable = createCrcTable();

export async function zipDirectory(directoryPath: string, options: ZipDirectoryOptions): Promise<Buffer> {
  const files = await collectFiles(directoryPath, options);
  return createZip(files);
}

async function collectFiles(directoryPath: string, options: ZipDirectoryOptions): Promise<ZipFileEntry[]> {
  const entries = await walk(directoryPath);
  const exclude = options.exclude ?? [];
  const files = await Promise.all(
    entries
      .filter((filePath) => !exclude.some((pattern) => matchesPattern(path.relative(directoryPath, filePath), pattern)))
      .map(async (filePath) => {
        const stat = await fs.stat(filePath);
        const relativePath = path.relative(directoryPath, filePath).split(path.sep).join("/");
        return {
          path: `${options.rootFolder}/${relativePath}`,
          data: await fs.readFile(filePath),
          mtime: stat.mtime
        };
      })
  );

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return walk(absolutePath);
      }

      return [absolutePath];
    })
  );

  return files.flat();
}

function createZip(files: ZipFileEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const centralDirectory: CentralDirectoryRecord[] = [];
  let offset = 0;

  for (const file of files) {
    const fileName = Buffer.from(file.path, "utf8");
    const { dosDate, dosTime } = toDosDateTime(file.mtime);
    const crc = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, fileName, file.data);
    centralDirectory.push({
      fileName,
      crc,
      size: file.data.length,
      dosTime,
      dosDate,
      offset
    });
    offset += localHeader.length + fileName.length + file.data.length;
  }

  const centralStart = offset;

  for (const file of centralDirectory) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(file.dosTime, 12);
    header.writeUInt16LE(file.dosDate, 14);
    header.writeUInt32LE(file.crc, 16);
    header.writeUInt32LE(file.size, 20);
    header.writeUInt32LE(file.size, 24);
    header.writeUInt16LE(file.fileName.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(file.offset, 42);

    chunks.push(header, file.fileName);
    offset += header.length + file.fileName.length;
  }

  const centralSize = offset - centralStart;
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(centralDirectory.length, 8);
  endRecord.writeUInt16LE(centralDirectory.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralStart, 16);
  endRecord.writeUInt16LE(0, 20);
  chunks.push(endRecord);

  return Buffer.concat(chunks);
}

function matchesPattern(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");

  if (pattern.endsWith("/**")) {
    return normalized === pattern.slice(0, -3) || normalized.startsWith(pattern.slice(0, -2));
  }

  return normalized === pattern;
}

function toDosDateTime(date: Date): { dosDate: number; dosTime: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): number[] {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}
