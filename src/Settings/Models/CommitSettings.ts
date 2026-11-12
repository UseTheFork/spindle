import { Records } from "@/Support/Records";

export interface CommitSettings {
  allow_body: boolean;
  title_max_length: number;
  scopes_enabled: boolean;
  allowed_scopes: string[];
  allow_breaking_changes: boolean;
}

export const defaultCommitSettings: CommitSettings = {
  allow_body: false,
  title_max_length: 72,
  scopes_enabled: false,
  allowed_scopes: [],
  allow_breaking_changes: false,
};

export function isCommitSettings(value: unknown): value is CommitSettings {
  return (
    Records.isRecord(value) &&
    typeof value.allow_body === "boolean" &&
    Number.isSafeInteger(value.title_max_length) &&
    typeof value.title_max_length === "number" &&
    value.title_max_length >= (value.allow_breaking_changes === true ? 12 : 11) &&
    typeof value.scopes_enabled === "boolean" &&
    Array.isArray(value.allowed_scopes) &&
    value.allowed_scopes.every(
      (scope) => typeof scope === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scope),
    ) &&
    new Set(value.allowed_scopes).size === value.allowed_scopes.length &&
    (!value.scopes_enabled || value.allowed_scopes.length > 0) &&
    (!value.scopes_enabled ||
      value.allowed_scopes.every(
        (scope) =>
          scope.length + 13 + (value.allow_breaking_changes === true ? 1 : 0) <=
          Number(value.title_max_length),
      )) &&
    typeof value.allow_breaking_changes === "boolean"
  );
}
