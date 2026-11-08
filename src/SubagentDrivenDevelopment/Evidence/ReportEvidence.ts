import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  ImplementationAssignment,
  ReviewAssignment,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { IssueProgress, FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { lstatIfPresent, isPathInside } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";

export class ReportEvidence extends Service {
  public constructor(
    app: Application,
    private readonly pathSafety: PathSafety,
  ) {
    super(app);
  }

  public assertReportPath(feature: FeaturePaths, path: string, mustExist: boolean): void {
    const reports = join(feature.workspace, "reports");
    const directory = lstatIfPresent(reports);
    if (!directory?.isDirectory() || directory.isSymbolicLink()) {
      throw new Error("Feature reports path must be a real directory.");
    }
    if (!isPathInside(reports, path) || !/^[^/]+\.md$/.test(path.slice(reports.length + 1))) {
      throw new Error("Implementation report must be a Markdown file inside feature reports/.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    if (!isPathInside(root, path) || !isPathInside(root, realpathSync(reports))) {
      throw new Error("Implementation report must remain inside this checkout.");
    }
    const relativePath = relative(root, path);
    if (this.pathSafety.isIgnored(root, relativePath)) {
      throw new Error(`Implementation report path is ignored: ${relativePath}`);
    }
    const entry = lstatIfPresent(path);
    if (mustExist && !entry)
      throw Object.assign(new Error("Report does not exist."), { code: "ENOENT" });
    if (entry && (!entry.isFile() || entry.isSymbolicLink())) {
      throw new Error(`Implementation report must be a regular file: ${path}.`);
    }
    if (entry && !isPathInside(reports, realpathSync(path))) {
      throw new Error("Implementation report must remain inside feature reports/.");
    }
  }

  public submissionReportPath(
    feature: FeaturePaths,
    assignment: Pick<ImplementationAssignment, "report"> | Pick<ReviewAssignment, "report">,
    supplied?: string,
  ): string {
    const path = supplied
      ? isAbsolute(supplied)
        ? resolve(supplied)
        : resolve(feature.workspace, supplied)
      : assignment.report;
    if (path !== assignment.report) {
      throw new Error(
        `Report target does not match the assigned destination ${assignment.report}.`,
      );
    }
    this.assertReportPath(feature, path, false);
    return path;
  }

  public readReportDigest(feature: FeaturePaths, report: string): string {
    this.assertReportPath(feature, report, true);
    return createHash("sha256").update(readFileSync(report)).digest("hex");
  }

  public assertAcceptedReportsCurrent(feature: FeaturePaths, progress: IssueProgress): void {
    const implementationReports = [
      progress.assignment,
      ...(progress.correctionAttempts ?? []).flatMap((attempt) => [attempt.assignment]),
    ].filter((assignment): assignment is ImplementationAssignment => !!assignment);
    for (const assignment of implementationReports) {
      if (assignment.status !== "submitted" || !assignment.reportSha256) {
        throw new Error(`Implementation report for ${assignment.id} is not current and submitted.`);
      }
      if (this.readReportDigest(feature, assignment.report) !== assignment.reportSha256) {
        throw new Error(`Implementation report for ${assignment.id} changed after submission.`);
      }
    }
    const reviewReports = [
      ...(progress.reviewAssignments ?? []),
      ...(progress.correctionAttempts ?? []).flatMap((attempt) => attempt.reviewAssignments ?? []),
    ];
    for (const assignment of reviewReports) {
      if (
        assignment.status !== "submitted" ||
        !assignment.reportSha256 ||
        this.readReportDigest(feature, assignment.report) !== assignment.reportSha256
      ) {
        throw new Error(`Review report for ${assignment.id} is not current and submitted.`);
      }
    }
  }
}
