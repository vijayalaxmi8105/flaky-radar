import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { RepositoryList } from "./pages/RepositoryList";
import { RepositoryDetail } from "./pages/RepositoryDetail";
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
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RepositoryList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/repositories/:repoId"
        element={
          <ProtectedRoute>
            <RepositoryDetail />
          </ProtectedRoute>
        }
      />
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