export class CheckRecords {
  public static latestForHead<T extends { command: string; headSha: string }>(
    records: readonly T[],
    headSha: string,
  ): T[] {
    const latest = new Map<string, T>();
    for (const record of records) {
      if (record.headSha === headSha) latest.set(record.command, record);
    }
    return [...latest.values()];
  }
}
