export class SddSequence {
  public static next(numbers: Iterable<string>): bigint {
    let highest = 0n;
    for (const number of numbers) {
      const value = BigInt(number);
      if (value > highest) highest = value;
    }
    return highest + 1n;
  }

  public static nextForIds(prefix: string, ids: string[]): bigint {
    return this.next(
      ids
        .filter((id) => id.startsWith(`${prefix}-`))
        .map((id) => id.slice(prefix.length + 1))
        .filter((suffix) => /^\d+$/.test(suffix)),
    );
  }

  public static format(prefix: string, number: bigint): string {
    return `${prefix}-${String(number).padStart(4, "0")}`;
  }
}
