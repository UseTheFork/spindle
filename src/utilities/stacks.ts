export const supportedStacks = ["php-laravel", "python", "typescript"] as const;

export function validateStacks(stacks: string[]) {
  for (const stack of stacks) {
    if (!supportedStacks.includes(stack as (typeof supportedStacks)[number])) {
      throw new Error(`Invalid stack '${stack}'. Supported stacks: ${supportedStacks.join(", ")}.`);
    }
  }
}
