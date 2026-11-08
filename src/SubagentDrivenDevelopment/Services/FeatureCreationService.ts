import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/services/Service";
import type { CreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { FeatureLedger, FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { FeatureWorkspace } from "@/SubagentDrivenDevelopment/Persistence/FeatureWorkspace";
import {
  assertRealDirectory,
  lstatIfPresent,
  isPathInside,
} from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateCreateOptions,
  featureSlug,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";

export class FeatureCreationService extends Service {
  public constructor(
    app: Application,
    private readonly featureWorkspace: FeatureWorkspace,
    private readonly pathSafety: PathSafety,
    private readonly workspaceTransaction: WorkspaceTransaction,
  ) {
    super(app);
  }

  public create(options: CreateOptions): FeaturePaths {
    validateCreateOptions(options);
    const root = realpathSync(this.app.workspaceRoot);
    if (!statSync(root).isDirectory()) throw new Error("Workspace root must be a directory.");

    const scratch = join(root, ".scratch");
    if (this.pathSafety.isIgnored(root, ".scratch/.sdd-create.lock")) {
      throw new Error("Feature destination is ignored: .scratch");
    }
    const scratchEntry = lstatIfPresent(scratch);
    if (scratchEntry) {
      assertRealDirectory(scratch, ".scratch");
    } else {
      try {
        mkdirSync(scratch);
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        ) {
          throw error;
        }
        assertRealDirectory(scratch, ".scratch");
      }
    }
    if (!isPathInside(root, realpathSync(scratch))) {
      throw new Error(".scratch must remain inside this checkout.");
    }

    const release = this.workspaceTransaction.acquireCreationLock(scratch);
    try {
      this.featureWorkspace.rejectAbandonedStaging(scratch);
      const id = this.featureWorkspace.nextFeatureId(scratch);
      const feature = `${id}-${featureSlug(options.title)}`;
      const workspace = join(scratch, feature);
      if (lstatIfPresent(workspace)) {
        throw new Error(`Feature workspace already exists: ${feature}`);
      }

      const relativeBase = `.scratch/${feature}`;
      for (const target of [
        `${relativeBase}/spec.md`,
        `${relativeBase}/sdd.json`,
        `${relativeBase}/issues`,
        `${relativeBase}/reports`,
      ]) {
        if (this.pathSafety.isIgnored(root, target)) {
          throw new Error(`Feature destination is ignored: ${target}`);
        }
      }

      const staging = mkdtempSync(join(scratch, ".sdd-create-"));
      try {
        mkdirSync(join(staging, "issues"));
        mkdirSync(join(staging, "reports"));
        const ledger: FeatureLedger = {
          schemaVersion: 1,
          featureId: id,
          title: options.title.trim(),
          createdBy: options.author.trim(),
          createdAt: new Date().toISOString(),
          retrospectiveRequired: options.requireRetrospective ?? false,
          reviewPolicy: {
            version: 1,
            issue: ["sdd-reviewer"],
            delivery: ["sdd-reviewer"],
          },
          issues: [],
          delivery: {
            execution: "unstarted",
            history: [],
          },
        };
        writeFileSync(join(staging, "spec.md"), `# ${options.title.trim()}\n`, {
          flag: "wx",
        });
        writeFileSync(join(staging, "sdd.json"), `${JSON.stringify(ledger, null, 2)}\n`, {
          flag: "wx",
        });
        if (lstatIfPresent(workspace)) {
          throw new Error(`Feature workspace already exists: ${feature}`);
        }
        renameSync(staging, workspace);
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw new Error(
          `Feature creation failed before publishing ${feature}; no complete workspace was created: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return {
        feature,
        workspace,
        spec: join(workspace, "spec.md"),
        ledger: join(workspace, "sdd.json"),
      };
    } finally {
      release();
    }
  }
}
