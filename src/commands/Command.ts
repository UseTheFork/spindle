import type { Command as CommanderCommand } from "commander";

import type { Application } from "@/foundation/Application";
import { Service } from "@/services/Service";

export abstract class Command extends Service {}

export interface CommandConstructor {
  new (app: Application): Command;
  register(program: CommanderCommand, createApp: () => Promise<Application>): void;
}
