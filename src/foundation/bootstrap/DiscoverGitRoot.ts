import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";
import { discoverGitRoot } from "@/utilities/git-root";

export class DiscoverGitRoot extends Bootstrapper {
  public bootstrap(application: Application): void {
    application.instance("path.workspace", discoverGitRoot(application.basePath));
  }
}
