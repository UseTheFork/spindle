import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { featureSchema, type Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import {
  featureLedgerSchema,
  type FeatureLedger,
} from "@spindle/SubagentDrivenDevelopment/Models/FeatureLedger";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

type NewWorkspace = Pick<Feature, "name" | "specification" | "design">;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const numberedWorkspace = /^([0-9]{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export class FeatureWorkspaceService extends Service {
  public async createNumbered(slug: string, records: Omit<NewWorkspace, "name">) {
    this.assertApplicationBooted();
    if (slug !== slug.trim() || !slugPattern.test(slug)) {
      throw new Error("Feature slug must be lowercase kebab-case.");
    }

    const features = await this.featuresDirectory(true);
    return this.withLock(join(features, ".allocation-lock"), async () => {
      let highest = 0n;
      for (const entry of await readdir(features)) {
        const match = numberedWorkspace.exec(entry);
        if (match && entry === entry.trim()) {
          const number = BigInt(match[1]);
          if (number > highest) highest = number;
        }
      }
      const name = `${String(highest + 1n).padStart(4, "0")}-${slug}`;
      await this.create({ ...records, name });
      return { name, workspace: join(features, name) };
    });
  }

  public async create(input: NewWorkspace): Promise<Feature> {
    this.assertApplicationBooted();
    const ledger: FeatureLedger = { version: 1, tickets: [], findings: [], reviewRounds: [] };
    const feature = featureSchema.parse({
      name: input.name,
      specification: input.specification,
      design: input.design,
      tickets: [],
      findings: [],
      reviewRounds: [],
    });

    const workspace = await this.workspacePath(input.name, true);
    await mkdir(workspace, { mode: 0o700 });
    try {
      await this.withLock(join(workspace, ".ledger-lock"), async () => {
        await mkdir(join(workspace, "tickets"));
        await mkdir(join(workspace, "reports"));
        await writeFile(join(workspace, "spec.md"), feature.specification, { flag: "wx" });
        if (feature.design !== undefined) {
          await writeFile(join(workspace, "design.md"), feature.design, { flag: "wx" });
        }
        await this.replaceLedger(workspace, ledger);
      });
      return feature;
    } catch (error) {
      throw new Error(`Could not initialize feature workspace at ${workspace}.`, { cause: error });
    }
  }

  public async load(reference: string): Promise<Feature> {
    this.assertApplicationBooted();
    const name = basename(reference);
    if (
      reference !== name &&
      resolve(this.app.workspaceRoot, reference) !==
        this.app.workspacePath(join(".spindle", "features", name))
    ) {
      throw new Error(
        "Feature directory must be under .spindle/features in the original checkout.",
      );
    }
    const workspace = await this.workspacePath(name);
    return this.assemble(name, workspace, await this.readLedger(workspace));
  }

  public async updateLedger(
    name: string,
    update: (ledger: FeatureLedger) => FeatureLedger | Promise<FeatureLedger>,
  ): Promise<Feature> {
    this.assertApplicationBooted();
    const workspace = await this.workspacePath(name);
    return this.withLock(join(workspace, ".ledger-lock"), async () => {
      const current = await this.readLedger(workspace);
      const next = featureLedgerSchema.parse(await update(current));
      const feature = await this.assemble(name, workspace, next);
      await this.replaceLedger(workspace, next);
      return feature;
    });
  }

  private async withLock<T>(lock: string, operation: () => Promise<T>): Promise<T> {
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch (error) {
      if (!FeatureWorkspaceService.hasCode(error, "EEXIST")) throw error;
      throw new Error(`Feature storage is locked: ${lock}`, { cause: error });
    }

    try {
      return await operation();
    } finally {
      await rmdir(lock);
    }
  }

  private async workspacePath(name: string, createParents = false): Promise<string> {
    if (name !== name.trim() || !numberedWorkspace.test(name)) {
      throw new Error(`Invalid numbered feature workspace name: '${name}'.`);
    }

    const workspace = join(await this.featuresDirectory(createParents), name);
    if (!createParents) await this.requireDirectory(workspace);
    return workspace;
  }

  private async featuresDirectory(createParents: boolean): Promise<string> {
    const state = this.app.workspacePath(".spindle");
    const features = join(state, "features");
    for (const directory of [state, features]) {
      if (createParents) {
        try {
          await mkdir(directory);
        } catch (error) {
          if (!FeatureWorkspaceService.hasCode(error, "EEXIST")) throw error;
        }
      }
      await this.requireDirectory(directory);
    }
    return features;
  }

  private async requireDirectory(path: string): Promise<void> {
    if (!(await lstat(path)).isDirectory()) throw new Error(`Expected a directory: ${path}`);
  }

  private async readRecord(path: string): Promise<string> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if (!(await file.stat()).isFile()) throw new Error(`Expected a regular file: ${path}`);
      return await file.readFile("utf8");
    } finally {
      await file.close();
    }
  }

  private async readLedger(workspace: string): Promise<FeatureLedger> {
    const path = join(workspace, "sdd.json");
    const content = await this.readRecord(path);
    try {
      return featureLedgerSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new Error(`Invalid feature ledger at ${path}: ${String(error)}`, { cause: error });
    }
  }

  private async replaceLedger(workspace: string, ledger: FeatureLedger): Promise<void> {
    const temporary = await mkdtemp(join(workspace, ".ledger-"));
    try {
      const pending = join(temporary, "sdd.json");
      await writeFile(pending, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx", flush: true });
      await rename(pending, join(workspace, "sdd.json"));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async assemble(name: string, workspace: string, ledger: FeatureLedger): Promise<Feature> {
    const design = await this.readRecord(join(workspace, "design.md")).catch((error: unknown) => {
      if (!FeatureWorkspaceService.hasCode(error, "ENOENT")) throw error;
      return undefined;
    });
    const ticketsDirectory = join(workspace, "tickets");
    await this.requireDirectory(ticketsDirectory);
    const tickets = await Promise.all(
      ledger.tickets.map(async (ticket) => {
        const path = join(ticketsDirectory, `${ticket.id}.md`);
        return { ...ticket, ...this.ticketRequirements(await this.readRecord(path), path) };
      }),
    );
    const { version: _version, ...facts } = ledger;
    const feature = featureSchema.parse({
      ...facts,
      name,
      specification: await this.readRecord(join(workspace, "spec.md")),
      design,
      tickets,
    });
    const graph = await this.app.make(WorkGraphService);
    const issues = graph.validate(feature);
    if (issues.length > 0) {
      throw new Error(`Invalid work graph for '${name}': ${JSON.stringify(issues)}`);
    }
    return feature;
  }

  private ticketRequirements(
    markdown: string,
    path: string,
  ): Pick<Feature["tickets"][number], "requirements" | "acceptanceCriteria"> {
    const sections = new Map<string, string[]>();
    let active: string[] | undefined;
    let fence: string | undefined;
    for (const line of markdown.split(/\r?\n/)) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (marker && marker[1].startsWith(fence) && marker[2].trim() === "") fence = undefined;
      } else if (marker) {
        fence = marker[1];
      } else {
        const heading = /^ {0,3}#{1,2}[ \t]+(.+?)\s*$/.exec(line);
        if (heading) {
          const label = heading[1];
          active = undefined;
          if (label === "Requirements" || label === "Acceptance Criteria") {
            if (sections.has(label)) throw new Error(`Duplicate '${label}' heading in ${path}.`);
            active = [];
            sections.set(label, active);
          }
          continue;
        }
      }
      active?.push(line);
    }
    const requirements = sections.get("Requirements")?.join("\n").trim();
    const acceptanceCriteria = sections.get("Acceptance Criteria")?.join("\n").trim();
    if (!requirements || !acceptanceCriteria) {
      throw new Error(
        `Expected non-empty Requirements and Acceptance Criteria sections in ${path}.`,
      );
    }
    return { requirements, acceptanceCriteria };
  }

  private static hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
  }
}
