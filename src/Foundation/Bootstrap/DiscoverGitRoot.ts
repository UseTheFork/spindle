import type { Application } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";
import { GitService } from "@/Git/Services/GitService";

export class DiscoverGitRoot extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    const git = await application.make(GitService);
    application.instance("path.workspace", git.discoverRoot(application.basePath()));
  }
}
