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

import { templateCatalog } from "@spindle/Assets/Templates/Catalog";
import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { CreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import type { FeatureLedger, FeaturePaths } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { FeatureWorkspace } from "@spindle/SubagentDrivenDevelopment/Persistence/FeatureWorkspace";
import { FileSystem } from "@spindle/SubagentDrivenDevelopment/Persistence/FileSystem";
import { PathSafety } from "@spindle/SubagentDrivenDevelopment/Persistence/PathSafety";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@spindle/SubagentDrivenDevelopment/Policies/InputValidation";
import { ResolveRenderContext } from "@spindle/TemplateRendering/Computed/ResolveRenderContext";
import { RenderText } from "@spindle/TemplateRendering/Rendering/RenderText";

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
    InputValidation.validateCreateOptions(options);
    const root = realpathSync(this.app.workspaceRoot);
    if (!statSync(root).isDirectory()) throw new Error("Workspace root must be a directory.");

    const featureDirectory = join(root, ".spindle", "features");
    if (this.pathSafety.isIgnored(root, ".spindle/features/.sdd-create.lock")) {
      throw new Error("Feature destination is ignored: .spindle/features");
    }
    const featureDirectoryEntry = FileSystem.lstatIfPresent(featureDirectory);
    if (featureDirectoryEntry) {
      FileSystem.assertRealDirectory(featureDirectory, ".spindle/features");
    } else {
      try {
        mkdirSync(featureDirectory);
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        ) {
          throw error;
        }
        FileSystem.assertRealDirectory(featureDirectory, ".spindle/features");
      }
    }
    if (!FileSystem.isPathInside(root, realpathSync(featureDirectory))) {
      throw new Error(".spindle/features must remain inside this checkout.");
    }

    const release = this.workspaceTransaction.acquireCreationLock(featureDirectory);
    try {
      this.featureWorkspace.rejectAbandonedStaging(featureDirectory);
      const id = this.featureWorkspace.nextFeatureId(featureDirectory);
      const feature = `${id}-${InputValidation.featureSlug(options.title)}`;
      const workspace = join(featureDirectory, feature);
      if (FileSystem.lstatIfPresent(workspace)) {
        throw new Error(`Feature workspace already exists: ${feature}`);
      }

      const relativeBase = `.spindle/features/${feature}`;
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

      const staging = mkdtempSync(join(featureDirectory, ".sdd-create-"));
      try {
        mkdirSync(join(staging, "tickets"));
        mkdirSync(join(staging, "reports"));
        const context = ResolveRenderContext.resolve(this.app, {
          variables: {
            title: options.title.trim(),
            author: options.author.trim(),
          },
        });
        const spec = RenderText.render(
          readFileSync(join(this.app.assetsPath("Templates"), templateCatalog.sdd.spec), "utf8"),
          context,
        );
        const design = options.withDesign
          ? RenderText.render(
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
        if (FileSystem.lstatIfPresent(workspace)) {
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
