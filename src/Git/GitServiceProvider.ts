import { GitService } from "@/Git/Services/GitService";
import { ServiceProvider } from "@/Foundation/ServiceProvider";

export class GitServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(GitService);
  }

  public async boot(): Promise<void> {}
}
