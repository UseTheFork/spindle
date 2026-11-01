import { agentHandler } from "./agents/handler.js";
import { skillHandler } from "./skills/handler.js";

export const blueprintHandlers = [skillHandler, agentHandler] as const;
