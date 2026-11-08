import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";
import { WorkspaceRoot } from "@/foundation/tokens";
import { discoverGitRoot } from "@/utilities/git-root";

export class DiscoverGitRoot extends Bootstrapper {
  public bootstrap(application: Application): void {
    application.instance(WorkspaceRoot, discoverGitRoot(application.basePath));
  }
}
