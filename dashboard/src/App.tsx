import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { RepositoryList } from "./pages/RepositoryList";
import { RepositoryDetail } from "./pages/RepositoryDetail";
import { FlakyRanking } from "./pages/FlakyRanking";
import { TestDetail } from "./pages/TestDetail";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Login */}
      <Route
        path="/login"
        element={<Login />}
      />

      {/* Repository List */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RepositoryList />
          </ProtectedRoute>
        }
      />

      {/* Repository Detail */}
      <Route
        path="/repositories/:repoId"
        element={
          <ProtectedRoute>
            <RepositoryDetail />
          </ProtectedRoute>
        }
      />

      {/* Flaky Tests Ranking */}
      <Route
        path="/repositories/:repoId/flaky-tests"
        element={
          <ProtectedRoute>
            <FlakyRanking />
          </ProtectedRoute>
        }
      />

      {/* Test Detail */}
      <Route
        path="/repositories/:repoId/tests/:testId"
        element={
          <ProtectedRoute>
            <TestDetail />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;