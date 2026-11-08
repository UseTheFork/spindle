import type { Application } from "../Application.js";
import { Bootstrapper } from "./Bootstrapper.js";

export class RegisterProviders extends Bootstrapper {
  public bootstrap(application: Application): void {
    application.registerProviders();
  }
}
