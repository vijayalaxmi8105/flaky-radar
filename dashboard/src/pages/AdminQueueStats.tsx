import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getQueueStats, ApiError, type QueueStats } from "../api/client";

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClasses =
    tone === "danger"
      ? "text-red-400"
      : tone === "warn"
      ? "text-amber-400"
      : "text-white";

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneClasses}`}>{value}</p>
    </div>
  );
}

export function AdminQueueStats() {
  const { accessToken, user, logout } = useAuth();
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    function fetchStats() {
      getQueueStats(accessToken!)
        .then((data) => {
          if (!cancelled) {
            setStats(data);
            setError(null);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError("Failed to load queue stats.");
          }
        });
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Queue Health</h1>
          {user && (
            <p className="text-sm text-slate-400">
              Signed in as {user.email} ({user.role})
            </p>
          )}
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

      {stats === null && !error && (
        <p className="text-slate-400">Loading queue stats...</p>
      )}

      {stats !== null && (
        <>
          <h2 className="text-lg font-semibold mb-3">ci-events queue</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatCard label="Waiting" value={stats.ciEvents.waiting} />
            <StatCard label="Active" value={stats.ciEvents.active} />
            <StatCard label="Completed" value={stats.ciEvents.completed} />
            <StatCard
              label="Failed"
              value={stats.ciEvents.failed}
              tone={stats.ciEvents.failed > 0 ? "warn" : "default"}
            />
            <StatCard label="Delayed" value={stats.ciEvents.delayed} />
          </div>

          <h2 className="text-lg font-semibold mb-3">Dead-letter queue</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="DLQ size"
              value={stats.dlq.size}
              tone={stats.dlq.size > 0 ? "danger" : "default"}
            />
          </div>

          <p className="text-xs text-slate-500 mt-6">
            Auto-refreshes every 5 seconds.
          </p>
        </>
      )}
    </div>
  );
}