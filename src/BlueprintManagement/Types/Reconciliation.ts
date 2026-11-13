import type { CatalogDeletion } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import type { BlueprintHandler, BlueprintUpdatePlan } from "@/BlueprintManagement/Types/Blueprint";
import type {
  ConflictPolicy,
  PlannedBlueprintFile,
} from "@/BlueprintManagement/Types/Installation";
import type { Application } from "@/Foundation/Application";
import type { ProjectSettingsData } from "@/Settings/Services/ProjectSettingsService";
import type { RenderContext } from "@/TemplateRendering/Rendering/RenderText";

export interface BlueprintOutcome {
  kind: string;
  name: string;
  status: "installed" | "updated" | "skipped" | "up-to-date" | "removed";
  warning?: string;
}

interface ReconcileCommon {
  app: Application;
  githubDirectory: string;
  blueprintSourceRoot: string;
  context?: RenderContext;
  resolveContext?: () => Promise<RenderContext>;
}

export type ReconcileOptions =
  | (ReconcileCommon & {
      mode: "init";
      context: RenderContext;
      settings: ProjectSettingsData;
      conflictPolicy?: ConflictPolicy;
      chooseConflict?: (kind: string, name: string) => Promise<ConflictPolicy>;
    })
  | (ReconcileCommon & {
      mode: "update";
      settings?: ProjectSettingsData;
      persistSettings?: boolean;
    });

type WithoutApplicationRoots<T> = T extends unknown
  ? Omit<T, "app" | "githubDirectory" | "blueprintSourceRoot">
  : never;

export type BlueprintReconciliationOptions = WithoutApplicationRoots<ReconcileOptions>;

export interface PlannedBlueprint {
  name: string;
  status: "install" | "new" | "conflict" | "update" | "warning" | "up-to-date";
  warning?: string;
  installedVersion?: string;
  availableVersion?: string;
  versionedEntry?: BlueprintUpdatePlan["versionedEntry"];
  renderedEntry?: BlueprintUpdatePlan["renderedEntry"];
}

export interface ReconciliationPlan {
  handler: BlueprintHandler;
  mode: ReconcileOptions["mode"];
  githubDirectory: string;
  destinationDirectory: string;
  sourceFilesByName: Map<string, PlannedBlueprintFile[]>;
  plan: PlannedBlueprint[];
  selectedNewBlueprints: Set<string>;
  decisions: Map<string, ConflictPolicy>;
  willInstall: boolean;
}

export interface PlannedBlueprintDeletion {
  kind: string;
  catalogKind: string;
  key: string;
  path: string;
  target: string;
  directory: boolean;
  reason: CatalogDeletion["reason"] | "directory-membership" | "obsolete";
}
