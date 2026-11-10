export class Stacks {
  public static readonly supported = ["php-laravel", "python", "typescript"] as const;

  public static validate(stacks: string[]): void {
    for (const stack of stacks) {
      if (!Stacks.supported.includes(stack as (typeof Stacks.supported)[number])) {
        throw new Error(
          `Invalid stack '${stack}'. Supported stacks: ${Stacks.supported.join(", ")}.`,
        );
      }
    }
  }
}
