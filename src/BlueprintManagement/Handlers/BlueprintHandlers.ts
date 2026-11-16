import { agentHandler } from "@spindle/BlueprintManagement/Handlers/Agents/AgentHandler";
import { instructionHandler } from "@spindle/BlueprintManagement/Handlers/Instructions/InstructionHandler";
import { skillHandler } from "@spindle/BlueprintManagement/Handlers/Skills/SkillHandler";

export const blueprintHandlers = [skillHandler, agentHandler, instructionHandler] as const;
