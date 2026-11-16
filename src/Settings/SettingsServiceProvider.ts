import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { SettingsCommand } from "@spindle/Settings/Commands/SettingsCommand";
import { SettingsService } from "@spindle/Settings/Services/SettingsService";

export class SettingsServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [SettingsCommand];
  }

  public register(): void {
    this.app.singleton(SettingsService);
  }

  public async boot(): Promise<void> {}
}
