"use client";

import { useCallback, useEffect, useState } from "react";
import type { ValidateResponse, ValidationIssue } from "@/app/api/fences/validate/route";

export interface ValidationPanelProps {
  /** Current validation result (from parent state) */
  validationResult: ValidateResponse | null;
  /** Called when validation data is loaded */
  onValidationLoaded: (data: ValidateResponse) => void;
  /** Called after fix so map can refetch fences */
  onFencesRefreshed?: () => void;
}

function issueLabels(issue: ValidationIssue): string[] {
  const labels: string[] = [];
  if (!issue.isValid && issue.validReason) labels.push(issue.validReason);
  if (!issue.isSimple) labels.push("Self-intersection");
  if (issue.hasUnclosedRing) labels.push("Unclosed polygon");
  if (issue.hasDuplicateVertices) labels.push("Duplicate vertices");
  return labels;
}

function isIssueInvalid(issue: ValidationIssue): boolean {
  return !issue.isValid || !issue.isSimple || issue.hasUnclosedRing || issue.hasDuplicateVertices;
}

export default function ValidationPanel({
  validationResult,
  onValidationLoaded,
  onFencesRefreshed,
}: ValidationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [markingInactive, setMarkingInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchValidation = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/fences/validate");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || j.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ValidateResponse;
      onValidationLoaded(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load validation");
    } finally {
      setLoading(false);
    }
  }, [onValidationLoaded]);

  useEffect(() => {
    fetchValidation();
  }, [fetchValidation]);

  const handleFix = useCallback(async () => {
    if (!validationResult) return;
    const invalidIds = validationResult.issues.filter(isIssueInvalid).map((i) => i.fenceId);
    if (invalidIds.length === 0) return;
    setError(null);
    setFixing(true);
    try {
      const res = await fetch("/api/fences/validate/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: invalidIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || j.error || `HTTP ${res.status}`);
      }
      onFencesRefreshed?.();
      await fetchValidation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fix failed");
    } finally {
      setFixing(false);
    }
  }, [validationResult, onFencesRefreshed, fetchValidation]);

  const handleMarkInactive = useCallback(async () => {
    if (!validationResult) return;
    const invalidCount = validationResult.issues.filter(isIssueInvalid).length;
    if (invalidCount === 0) return;
    if (!window.confirm(`Mark ${invalidCount} invalid fences as 'inactive'?`)) return;
    setError(null);
    setMarkingInactive(true);
    try {
      const res = await fetch("/api/fences/validate/mark-inactive", {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || j.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      alert(`Success! ${data.updatedCount} fences marked as inactive.`);
      onFencesRefreshed?.();
      await fetchValidation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mark inactive failed");
    } finally {
      setMarkingInactive(false);
    }
  }, [validationResult, onFencesRefreshed, fetchValidation]);

  const invalidIssues = validationResult?.issues.filter(isIssueInvalid) ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Geometry validation</p>
        <button
          type="button"
          onClick={fetchValidation}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {validationResult && !loading && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-green-100 bg-green-50/80 p-2">
              <p className="text-xs text-slate-500">Valid</p>
              <p className="text-lg font-semibold text-green-800">{validationResult.validCount}</p>
            </div>
            <div className="rounded border border-red-100 bg-red-50/80 p-2">
              <p className="text-xs text-slate-500">Invalid</p>
              <p className="text-lg font-semibold text-red-800">{validationResult.invalidCount}</p>
            </div>
          </div>

          {invalidIssues.length > 0 && (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-slate-600">Issues (click for details)</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {invalidIssues.map((issue) => {
                    const open = expandedId === issue.fenceId;
                    const labels = issueLabels(issue);
                    return (
                      <li key={issue.fenceId} className="rounded border border-red-100 bg-red-50/50">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : issue.fenceId)}
                          className="w-full px-2 py-1 text-left font-medium text-red-900 hover:bg-red-100/50"
                        >
                          #{issue.fenceId} {issue.name}
                        </button>
                        {open && (
                          <div className="border-t border-red-100 px-2 py-1 text-red-800">
                            {labels.map((l, i) => (
                              <p key={i}>{l}</p>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleFix}
                  disabled={fixing || markingInactive}
                  className="rounded bg-amber-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {fixing ? "Fixing…" : "Fix automatically (ST_MakeValid)"}
                </button>
                <button
                  type="button"
                  onClick={handleMarkInactive}
                  disabled={fixing || markingInactive}
                  className="rounded bg-red-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {markingInactive ? "Updating…" : "Mark all invalid as Inactive"}
                </button>
              </div>
            </>
          )}

          {validationResult.invalidCount === 0 && validationResult.issues.length > 0 && (
            <p className="text-xs text-green-700">All geometries are valid.</p>
          )}
        </>
      )}

      {!validationResult && !loading && !error && (
        <p className="text-xs text-slate-500">Run validation to see results.</p>
      )}
    </div>
  );
}
