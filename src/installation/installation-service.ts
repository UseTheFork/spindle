import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { App, Service } from "../app.js";
import { assertSingleFileDestination } from "../utilities/blueprint-files.js";
import type { PreparedBlueprintFile } from "./types.js";

async function installFile(
  file: PreparedBlueprintFile,
  destinationPath: string,
  replace = false,
  requireText = false,
) {
  await mkdir(dirname(destinationPath), { recursive: true });
  if (replace && requireText) {
    await assertSingleFileDestination(destinationPath, true);
    const stagingDirectory = await mkdtemp(join(dirname(destinationPath), ".spindle-"));
    try {
      const stagedPath = join(stagingDirectory, basename(destinationPath));
      await writeFile(stagedPath, file.renderedText!, { flag: "wx" });
      await assertSingleFileDestination(destinationPath, true);
      await rename(stagedPath, destinationPath);
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (replace) await rm(destinationPath, { recursive: true, force: true });
  if (file.renderedText === null) {
    await copyFile(file.sourcePath, destinationPath);
  } else if (requireText) {
    await writeFile(destinationPath, file.renderedText, { flag: "wx" });
  } else {
    await writeFile(destinationPath, file.renderedText);
  }
}

export class InstallationService extends Service {
  constructor(app: App) {
    super(app);
  }

  async installPreparedFiles(
    files: PreparedBlueprintFile[],
    target: string,
    entryFile?: string,
    replace = false,
    atTarget = false,
    onFileApplied?: (file: PreparedBlueprintFile, destinationPath: string) => void,
  ): Promise<void> {
    for (const file of files) {
      const destinationPath = atTarget
        ? target
        : entryFile === undefined
          ? join(target, file.outputPath)
          : target;
      try {
        await installFile(
          file,
          destinationPath,
          replace,
          entryFile !== undefined || (atTarget && file.outputPath.toLowerCase().endsWith(".md")),
        );
      } catch (error) {
        throw new Error(
          `Failed to apply file '${file.outputPath}' at '${destinationPath}': ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      onFileApplied?.(file, destinationPath);
    }
  }
}
