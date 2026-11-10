import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import {
  FEATURE_DIRECTORY,
  HISTORICAL_DATE_DIRECTORY,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type { FeatureLedger, FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";
import {
  assertRealDirectory,
  lstatIfPresent,
  isPathInside,
} from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";

export class FeatureWorkspace extends Service {
  public constructor(
    app: Application,
    private readonly ledgerRepository: LedgerRepository,
    private readonly pathSafety: PathSafety,
  ) {
    super(app);
  }

  public statusFromPaths(
    root: string,
    specPath: string,
    relativeSpec: string,
    segments: string[],
  ): FeaturePaths & { state: FeatureLedger } {
    const scratch = join(root, ".scratch");
    const workspace = join(scratch, segments[1]!);
    const ledgerPath = join(workspace, "sdd.json");
    assertRealDirectory(scratch, ".scratch");
    assertRealDirectory(workspace, "Feature workspace");
    for (const directory of ["tickets", "reports"]) {
      assertRealDirectory(join(workspace, directory), `Feature ${directory} directory`);
    }
    const specEntry = lstatIfPresent(specPath);
    if (!specEntry?.isFile()) throw new Error("Feature spec must be a regular file.");
    const ledgerEntry = lstatIfPresent(ledgerPath);
    if (!ledgerEntry?.isFile()) throw new Error("Feature ledger must be a regular file.");
    if (
      !isPathInside(root, realpathSync(specPath)) ||
      !isPathInside(root, realpathSync(ledgerPath))
    ) {
      throw new Error("Feature files must remain inside this checkout.");
    }
    for (const path of [relativeSpec, relative(root, ledgerPath)]) {
      if (this.pathSafety.isIgnored(root, path))
        throw new Error(`Feature path is ignored: ${path}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ledgerPath, "utf8"));
    } catch (error) {
      throw new Error(
        `Feature ledger is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const state = this.ledgerRepository.validateLedger(parsed, segments[1]!);
    const feature = segments[1]!;
    return {
      feature,
      workspace,
      spec: specPath,
      ledger: ledgerPath,
      state,
    };
  }

  public nextFeatureId(scratch: string): string {
    let highest = 0n;
    for (const entry of readdirSync(scratch, { withFileTypes: true })) {
      if (!entry.isDirectory() || HISTORICAL_DATE_DIRECTORY.test(entry.name)) continue;
      const match = FEATURE_DIRECTORY.exec(entry.name);
      if (!match) continue;
      const id = BigInt(match[1]!);
      if (id > highest) highest = id;
    }
    return String(highest + 1n).padStart(4, "0");
  }

  public rejectAbandonedStaging(scratch: string): void {
    const abandoned = readdirSync(scratch, { withFileTypes: true })
      .filter((entry) => entry.name.startsWith(".sdd-create-"))
      .map((entry) => join(scratch, entry.name));
    if (abandoned.length > 0) {
      throw new Error(
        `Incomplete feature creation staging content was preserved at ${abandoned.join(", ")}. Inspect and remove it before retrying.`,
      );
    }
  }
}
