import type { CommandConstructor } from "@/Commands/Command";
import { SetupProjectCommand } from "@/Commands/setup-project/setup-project-command";
import { ServiceProvider } from "@/Foundation/ServiceProvider";

export class ProductionServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [SetupProjectCommand];
  }

  public register(): void {}

  public async boot(): Promise<void> {}
}
