import { agentHandler } from "./agents/handler.js";
import { instructionHandler } from "./instructions/handler.js";
import { skillHandler } from "./skills/handler.js";

export const blueprintHandlers = [skillHandler, agentHandler, instructionHandler] as const;
