import type { Command as CommanderCommand } from "commander";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";

export abstract class Command extends Service {}

export interface CommandConstructor {
  new (app: Application): Command;
  register(program: CommanderCommand, createApp: () => Promise<Application>): void;
}
