import type { CommandConstructor } from "@/Commands/Command";
import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { SettingsCommand } from "@/Settings/Commands/SettingsCommand";
import { SettingsService } from "@/Settings/Services/SettingsService";

export class SettingsServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [SettingsCommand];
  }

  public register(): void {
    this.app.singleton(SettingsService);
  }

  public async boot(): Promise<void> {}
}
