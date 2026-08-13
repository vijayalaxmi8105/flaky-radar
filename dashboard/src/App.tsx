import { AuthProvider } from "./auth/AuthContext";
import { Login } from "./pages/Login";

function App() {
  return (
    <AuthProvider>
      <Login />
    </AuthProvider>
  );
}

export default App;