import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeFileIfChanged(filePath: string, contents: string, dryRun: boolean) {
  const existing = (await pathExists(filePath)) ? await readFile(filePath, "utf8") : undefined;
  if (existing === contents) {
    return "unchanged" as const;
  }

  if (!dryRun) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }

  return existing === undefined ? ("created" as const) : ("updated" as const);
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(entryPath);
      }
      return [entryPath];
    }),
  );

  return files.flat();
}
