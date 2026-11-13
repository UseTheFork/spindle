import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { templateCatalog } from "@/Assets/Templates/Catalog";
import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
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
import { resolveRenderContext } from "@/TemplateRendering/Computed/ResolveRenderContext";
import { renderText } from "@/TemplateRendering/Rendering/RenderText";

export class FeatureCreationService extends Service {
  public constructor(
    app: Application,
    private readonly featureWorkspace: FeatureWorkspace,
    private readonly pathSafety: PathSafety,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly gitEvidence: GitEvidence,
  ) {
    super(app);
  }

  public create(options: CreateOptions): FeaturePaths {
    this.assertApplicationBooted();
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
      const targets = [
        `${relativeBase}/spec.md`,
        `${relativeBase}/sdd.json`,
        `${relativeBase}/tickets`,
        `${relativeBase}/reports`,
      ];
      if (options.withDesign) targets.push(`${relativeBase}/design.md`);
      for (const target of targets) {
        if (this.pathSafety.isIgnored(root, target)) {
          throw new Error(`Feature destination is ignored: ${target}`);
        }
      }

      const staging = mkdtempSync(join(scratch, ".sdd-create-"));
      try {
        mkdirSync(join(staging, "tickets"));
        mkdirSync(join(staging, "reports"));
        const context = resolveRenderContext(this.app, {
          variables: {
            title: options.title.trim(),
            author: options.author.trim(),
          },
        });
        const spec = renderText(
          readFileSync(join(this.app.assetsPath("Templates"), templateCatalog.sdd.spec), "utf8"),
          context,
        );
        const design = options.withDesign
          ? renderText(
              readFileSync(
                join(this.app.assetsPath("Templates"), templateCatalog.sdd.design),
                "utf8",
              ),
              context,
            )
          : undefined;
        const ledger: FeatureLedger = {
          schemaVersion: 3,
          featureId: id,
          title: options.title.trim(),
          createdBy: options.author.trim(),
          createdAt: new Date().toISOString(),
          retrospectiveRequired: options.requireRetrospective ?? false,
          reviewPolicy: {
            version: 1,
            ticket: ["sdd-task-reviewer"],
            delivery: ["sdd-reviewer"],
          },
          tickets: [],
          delivery: {
            status: "active",
            execution: "unstarted",
            history: [],
            baseSha: this.gitEvidence.headSha(),
          },
        };
        writeFileSync(join(staging, "spec.md"), spec, { flag: "wx" });
        if (design !== undefined) {
          writeFileSync(join(staging, "design.md"), design, { flag: "wx" });
        }
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
