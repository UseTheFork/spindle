import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { ServiceProvider } from "@/Foundation/ServiceProvider";

export class FoundationServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(ConsoleOutputService, () => new ConsoleOutputService());
  }

  public async boot(): Promise<void> {}
}
