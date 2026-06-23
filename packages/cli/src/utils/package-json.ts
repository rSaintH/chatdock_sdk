import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";

export type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  const packagePath = path.join(cwd, "package.json");
  if (!(await pathExists(packagePath))) {
    return null;
  }

  return JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
}

export function hasDependency(packageJson: PackageJson, name: string) {
  return Boolean(getDependencyVersion(packageJson, name));
}

export function getDependencyVersion(packageJson: PackageJson, name: string) {
  return (
    packageJson.dependencies?.[name] ??
    packageJson.devDependencies?.[name] ??
    packageJson.peerDependencies?.[name]
  );
}
