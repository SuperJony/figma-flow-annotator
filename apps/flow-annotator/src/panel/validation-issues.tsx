import { cn } from "./lib/utils";
import type { PanelPostMessage, ValidationFilter, ValidationReport } from "./panel-types";
import { Button } from "./ui/button";

interface ValidationIssuesProps {
  activeFilter: ValidationFilter;
  post: PanelPostMessage;
  report: ValidationReport;
}

export function ValidationIssues({ activeFilter, post, report }: ValidationIssuesProps) {
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const filteredIssues =
    activeFilter === "all" ? issues : issues.filter((issue) => issue.severity === activeFilter);

  if (filteredIssues.length === 0) {
    return (
      <div className="empty-report typography-body-medium text-black-500">
        {issues.length === 0 ? "No validation issues found." : "No issues match this filter."}
      </div>
    );
  }

  return (
    <>
      {filteredIssues.map((issue) => (
        <div
          className={cn(
            "issue-row grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border border-grey-200 border-l-4 bg-white-1000 p-1.5",
            issue.severity,
            issue.severity === "error" && "border-l-red-500",
            issue.severity === "warning" && "border-l-orange-700",
            issue.severity === "info" && "border-l-blue-500",
          )}
          key={issue.id}
        >
          <div className="grid min-w-0 gap-0.5">
            <div className="issue-title typography-body-medium-strong text-black-1000">
              {issue.title}
            </div>
            <div className="issue-meta typography-body-medium text-black-500">
              {formatSeverity(issue.severity)} - {issue.affectedObjectCount} affected
            </div>
            <div className="issue-description typography-body-medium text-black-500">
              {issue.description}
            </div>
          </div>
          <Button
            className="locate"
            data-issue-id={issue.id}
            onClick={() => post({ issueId: issue.id, type: "locate-validation-issue" })}
            variant="secondary"
          >
            Locate
          </Button>
        </div>
      ))}
    </>
  );
}

function formatSeverity(severity: string) {
  if (severity === "error") {
    return "Error";
  }
  if (severity === "warning") {
    return "Warning";
  }
  return "Info";
}
