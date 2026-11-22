export class PreparedVsCodeIntegration {
  public constructor(
    public readonly workspace: string,
    public readonly files: readonly {
      readonly destination: string;
      readonly original: string | undefined;
      readonly content: string;
    }[],
  ) {}
}
