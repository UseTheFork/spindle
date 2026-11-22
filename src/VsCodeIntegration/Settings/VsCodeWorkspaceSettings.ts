import { Records } from "@spindle/Support/Records";
import {
  applyEdits,
  getNodeValue,
  modify,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";

export class VsCodeWorkspaceSettings {
  public static parse(source: string, path: string): Record<string, unknown> {
    const value: unknown = getNodeValue(this.parseObject(source, path));
    if (!Records.isRecord(value)) throw new Error(`'${path}' must contain a JSONC object.`);
    return value;
  }

  public static merge(
    original: string | undefined,
    managed: Readonly<Record<string, unknown>>,
    path: string,
  ): string {
    let content = original ?? "{\n}\n";
    const root = this.parseObject(content, path);
    const indentation = root.children
      ?.map((property) =>
        content.slice(content.lastIndexOf("\n", property.offset) + 1, property.offset),
      )
      .find((prefix) => /^[ \t]+$/.test(prefix));
    const indent = indentation ?? "  ";
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const multiline = content.slice(root.offset, root.offset + root.length).includes("\n");
    for (const [key, value] of Object.entries(managed).reverse()) {
      if (value === undefined) throw new Error(`Managed VS Code setting '${key}' has no value.`);
      const properties = this.properties(content, path, key);
      const serialized = JSON.stringify(value, undefined, multiline ? indent : undefined);
      if (serialized === undefined) {
        throw new Error(`Managed VS Code setting '${key}' is not JSON data.`);
      }
      if (properties.length !== 0) {
        const edits = properties.flatMap((property) => {
          const valueNode = property.children?.[1];
          if (!valueNode) throw new Error(`'${path}' has no value for '${key}'.`);
          const current: unknown = getNodeValue(valueNode);
          if (this.equal(current, value)) return [];
          const propertyIndent =
            /^[ \t]*/.exec(content.slice(content.lastIndexOf("\n", valueNode.offset) + 1))?.[0] ??
            "";
          return [
            {
              offset: valueNode.offset,
              length: valueNode.length,
              content: serialized.replaceAll("\n", `${eol}${propertyIndent}`),
            },
          ];
        });
        content = applyEdits(content, edits);
        continue;
      }
      const formatted = serialized.replaceAll("\n", `${eol}${indent}`);
      // Formatting options make jsonc-parser reformat unrelated content on neighboring lines.
      const edits = modify(content, [key], value, { getInsertionIndex: () => 0 });
      content = applyEdits(
        content,
        edits.map((edit) => ({
          ...edit,
          content: `${multiline ? `${eol}${indent}` : ""}${JSON.stringify(key)}: ${formatted}${this.parseObject(content, path).children?.length ? "," : ""}`,
        })),
      );
    }
    this.parseObject(content, path);
    return content;
  }

  private static equal(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) && Array.isArray(right)) {
      return (
        left.length === right.length &&
        left.every((value, index) => this.equal(value, right[index]))
      );
    }
    if (Records.isRecord(left) && Records.isRecord(right)) {
      const keys = Object.keys(left);
      return (
        keys.length === Object.keys(right).length &&
        keys.every((key) => Object.hasOwn(right, key) && this.equal(left[key], right[key]))
      );
    }
    return left === right;
  }

  private static properties(source: string, path: string, key: string): Node[] {
    return (
      this.parseObject(source, path).children?.filter(
        (property) => property.children?.[0]?.value === key,
      ) ?? []
    );
  }

  private static parseObject(source: string, path: string): Node {
    const errors: ParseError[] = [];
    const root = parseTree(source, errors, { allowTrailingComma: true });
    if (errors.length !== 0) {
      const details = errors
        .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
        .join("; ");
      throw new Error(`'${path}' is not valid JSONC: ${details}.`);
    }
    if (root?.type !== "object") throw new Error(`'${path}' must contain a JSONC object.`);
    return root;
  }
}
