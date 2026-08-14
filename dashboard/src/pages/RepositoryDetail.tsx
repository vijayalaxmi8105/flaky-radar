import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getFlakyTests, ApiError, type FlakyTest } from "../api/client";

export function RepositoryDetail() {
  const { repoId } = useParams<{ repoId: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [flakyTests, setFlakyTests] = useState<FlakyTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !repoId) return;
    let cancelled = false;

    getFlakyTests(accessToken, repoId)
      .then((tests: FlakyTest[]) => {
        if (!cancelled) setFlakyTests(tests);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load flaky tests.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, repoId]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-sm text-slate-400 hover:text-white mb-2"
        >
          ← Back to repositories
        </button>
        <h1 className="text-2xl font-bold">Flaky Tests</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {flakyTests === null && !error && (
        <p className="text-slate-400">Loading flaky tests...</p>
      )}

      {flakyTests !== null && flakyTests.length === 0 && !error && (
        <p className="text-slate-400">No flaky tests found for this repository.</p>
      )}

      {flakyTests !== null && flakyTests.length > 0 && (
        <div className="grid gap-3">
          {flakyTests.map((test) => (
            <div
              key={test.testId}
              onClick={() => navigate(`/repositories/${repoId}/tests/${test.testId}`)}
              className="bg-slate-800 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700"
            >
              <div>
                <p className="font-medium">{test.testName}</p>
                <p className="text-sm text-slate-400">{test.suiteName}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-amber-400">
                  {Math.round(test.confidenceScore * 100)}%
                </p>
                <p className="text-xs text-slate-500">confidence</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}