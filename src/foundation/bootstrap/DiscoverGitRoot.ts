import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";
import { GitService } from "@/Git/Services/GitService";

export class DiscoverGitRoot extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    const git = await application.make(GitService);
    application.instance("path.workspace", git.discoverRoot(application.basePath()));
  }
}
