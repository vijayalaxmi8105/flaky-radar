import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "../auth/AuthContext";
import {
  getTestDetail,
  getTestTimeline,
  ApiError,
  type TestDetail as TestDetailData,
  type TimelineDay,
} from "../api/client";

function classificationColor(classification: string): string {
  switch (classification) {
    case "FLAKY":
      return "text-amber-400";
    case "STABLE":
      return "text-green-400";
    case "BROKEN":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

export function TestDetail() {
  const { repoId, testId } = useParams<{ repoId: string; testId: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TestDetailData | null>(null);
  const [timeline, setTimeline] = useState<TimelineDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !repoId || !testId) return;
    let cancelled = false;

    Promise.all([
      getTestDetail(accessToken, repoId, testId),
      getTestTimeline(accessToken, repoId, testId),
    ])
      .then(([detailData, timelineData]: [TestDetailData, TimelineDay[]]) => {
        if (cancelled) return;
        setDetail(detailData);
        setTimeline(timelineData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load test detail.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, repoId, testId]);

  const chartData = (timeline ?? []).map((day) => ({
    date: day.date,
    pass: day.passCount,
    fail: day.failCount,
  }));

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="mb-6">
        <button
          onClick={() => navigate(`/repositories/${repoId}`)}
          className="text-sm text-slate-400 hover:text-white mb-2"
        >
          ← Back to flaky tests
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {detail === null && !error && (
        <p className="text-slate-400">Loading test detail...</p>
      )}

      {detail !== null && (
        <>
          <h1 className="text-2xl font-bold mb-1">{detail.testName}</h1>
          <p className="text-sm text-slate-400 mb-6">{detail.suiteName}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Classification</p>
              <p className={`text-xl font-semibold ${classificationColor(detail.classification)}`}>
                {detail.classification}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Confidence</p>
              <p className="text-xl font-semibold">
                {Math.round(detail.confidenceScore * 100)}%
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Failure Rate</p>
              <p className="text-xl font-semibold">
                {Math.round(detail.failureRate * 100)}%
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Total Runs</p>
              <p className="text-xl font-semibold">{detail.totalExecutions}</p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 mb-6" style={{ height: 300 }}>
            <p className="text-sm text-slate-400 mb-2">Pass / Fail Timeline</p>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                />
                <Line type="monotone" dataKey="pass" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="fail" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-3">Daily Result Heatmap</p>
            <div className="flex flex-wrap gap-1">
              {(timeline ?? []).map((day) => {
                const total = day.passCount + day.failCount;
                const failRatio = total > 0 ? day.failCount / total : 0;
                const bg =
                  total === 0
                    ? "#334155"
                    : failRatio === 0
                    ? "#22c55e"
                    : failRatio < 0.5
                    ? "#eab308"
                    : "#ef4444";
                return (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.passCount} pass, ${day.failCount} fail`}
                    style={{ backgroundColor: bg }}
                    className="w-6 h-6 rounded-sm"
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}