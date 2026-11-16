export class CommandOptions {
  public static once(option: string): (value: string) => string {
    let seen = false;
    return (value: string): string => {
      if (seen) {
        throw new Error(`Option '${option}' may only be provided once.`);
      }
      seen = true;
      return value;
    };
  }

  public static featureSpec(directory: string): string {
    return `${directory.replace(/\/$/, "")}/spec.md`;
  }
}
