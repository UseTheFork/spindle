import { agentHandler } from "@/BlueprintManagement/Handlers/Agents/AgentHandler";
import { instructionHandler } from "@/BlueprintManagement/Handlers/Instructions/InstructionHandler";
import { skillHandler } from "@/BlueprintManagement/Handlers/Skills/SkillHandler";

export const blueprintHandlers = [skillHandler, agentHandler, instructionHandler] as const;
