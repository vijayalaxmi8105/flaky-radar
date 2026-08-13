import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAuth } from "../auth/AuthContext";
import { getRepositories, ApiError, type Repository } from "../api/client";

function scoreColor(score: number | null): string {
  if (score === null) return "#64748b"; // slate-500, no data
  if (score >= 0.9) return "#22c55e"; // green-500
  if (score >= 0.7) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

export function RepositoryList() {
  const { accessToken, user, logout } = useAuth();
  const [repositories, setRepositories] = useState<Repository[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    getRepositories(accessToken)
      .then((repos) => {
        if (!cancelled) setRepositories(repos);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load repositories.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const chartData = (repositories ?? []).map((repo) => ({
    name: repo.name,
    score: repo.reliabilityScore !== null ? Math.round(repo.reliabilityScore * 100) : 0,
    hasData: repo.reliabilityScore !== null,
  }));

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Repositories</h1>
          {user && <p className="text-sm text-slate-400">Signed in as {user.email} ({user.role})</p>}
        </div>
        <button
          onClick={logout}
          className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm"
        >
          Log out
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {repositories === null && !error && (
        <p className="text-slate-400">Loading repositories...</p>
      )}

      {repositories !== null && repositories.length === 0 && !error && (
        <p className="text-slate-400">
          No repositories yet. You don't have access to any repositories, or none are configured.
        </p>
      )}

      {repositories !== null && repositories.length > 0 && (
        <>
          <div className="bg-slate-800 rounded-lg p-4 mb-6" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                  formatter={(value) => {
                    if (typeof value === "number") {
                      return [`${value}%`, "Reliability"];
                    }
                    return ["No data", "Reliability"];
                  }}
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={scoreColor(entry.hasData ? entry.score / 100 : null)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3">
            {repositories.map((repo) => (
              <div
                key={repo.id}
                className="bg-slate-800 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{repo.fullName}</p>
                  <p className="text-sm text-slate-400">
                    {repo.defaultBranch} · {repo.testCount} tests
                    {!repo.isActive && <span className="text-amber-400 ml-2">Inactive</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">
                    {repo.reliabilityScore !== null
                      ? `${Math.round(repo.reliabilityScore * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-500">reliability</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}