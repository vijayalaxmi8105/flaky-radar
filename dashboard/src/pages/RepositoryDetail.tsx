import { useNavigate, useParams } from "react-router-dom";

export function RepositoryDetail() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-sm text-slate-400 hover:text-white mb-2"
        >
          ← Back to repositories
        </button>

        <h1 className="text-2xl font-bold">
          Repository
        </h1>
      </div>

      <button
        onClick={() =>
          navigate(`/repositories/${repoId}/flaky-tests`)
        }
        className="bg-slate-800 rounded-lg p-4 flex items-center justify-between hover:bg-slate-700 w-full text-left"
      >
        <div>
          <p className="font-medium">
            Fix This First
          </p>

          <p className="text-sm text-slate-400">
            Ranked flaky tests, updated live as new runs complete
          </p>
        </div>

        <span className="text-slate-400">
          →
        </span>
      </button>
    </div>
  );
}