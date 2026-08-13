const API_BASE_URL = "http://localhost:3000";

export type Role = "admin" | "member" | "viewer";

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export class ApiError extends Error {
  code: string;
  requestId: string;

  constructor(body: ApiErrorBody["error"]) {
    super(body.message);
    this.code = body.code;
    this.requestId = body.requestId;
  }
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError((body as ApiErrorBody).error);
  }

  return body as LoginResponse;
}