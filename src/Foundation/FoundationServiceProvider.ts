import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";

export class FoundationServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(ConsoleOutputService, () => new ConsoleOutputService());
  }

  public async boot(): Promise<void> {}
}
