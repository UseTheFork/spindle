import type { Application } from "@spindle/Foundation/Application";
import { Bootstrapper } from "@spindle/Foundation/Bootstrap/Bootstrapper";
import { GitService } from "@spindle/Git/Services/GitService";

export class DiscoverGitRoot extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    const git = await application.make(GitService);
    application.instance("path.workspace", git.discoverRoot(application.basePath()));
  }
}
