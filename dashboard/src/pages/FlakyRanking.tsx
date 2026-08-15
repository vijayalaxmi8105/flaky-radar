import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getFlakyTests, type FlakyTest, ApiError } from "../api/client";
import { useLiveUpdates } from "../hooks/useLiveUpdates";

export function FlakyRanking() {
  const { repoId } = useParams<{ repoId: string }>();
  const { accessToken } = useAuth();
  const [tests, setTests] = useState<FlakyTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);

  const fetchTests = useCallback(async () => {
    if (!accessToken || !repoId) return;
    try {
      const result = await getFlakyTests(accessToken, repoId);
      setTests(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load flaky tests.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, repoId]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  useLiveUpdates((event) => {
    if (
      (event.type === "run:completed" && event.repositoryId === repoId) ||
      (event.type === "scores:recomputed" &&
        (!event.repositoryId || event.repositoryId === repoId))
    ) {
      fetchTests();
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 2000);
    }
  });

  if (loading) return <div className="p-6 text-gray-500">Loading flaky tests…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Fix This First</h1>
        {justUpdated && (
          <span className="text-sm text-green-600 animate-pulse">Updated</span>
        )}
      </div>

      {tests.length === 0 ? (
        <p className="text-gray-500">No flaky tests detected for this repository.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border rounded-lg">
          {tests.map((test, i) => (
            <li key={test.testId} className="p-4 hover:bg-gray-50">
              <Link
                to={`/repositories/${repoId}/tests/${test.testId}`}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="text-gray-400 mr-2">#{i + 1}</span>
                  <span className="font-medium">{test.testName}</span>
                  <span className="text-gray-500 text-sm ml-2">{test.suiteName}</span>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold text-red-600">
                    {(test.confidenceScore * 100).toFixed(0)}% confidence
                  </div>
                  <div className="text-gray-500">
                    {(test.failureRate * 100).toFixed(0)}% failure rate ·{" "}
                    {test.totalExecutions} runs
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}