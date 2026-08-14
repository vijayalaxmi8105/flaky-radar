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

export type ReliabilityStatus = "healthy" | "watch" | "flaky";

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isActive: boolean;
  githubId: string;
  reliabilityScore: number | null;
  testCount: number;
  status?: ReliabilityStatus;
}

export interface RepositoriesResponse {
  repositories: Repository[];
}

export async function getRepositories(accessToken: string): Promise<Repository[]> {
  const res = await fetch(`${API_BASE_URL}/api/repositories`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) {
    // Some errors (e.g. auth middleware) return {error: "code_string"},
    // others (sendError) return {error: {code, message, requestId}}.
    const errField = body?.error;
    if (typeof errField === "string") {
      throw new ApiError({ code: errField, message: errField, requestId: "" });
    }
    throw new ApiError(errField as ApiErrorBody["error"]);
  }
  return (body as RepositoriesResponse).repositories;
}

export interface FlakyTest {
  testId: string;
  suiteName: string;
  testName: string;
  passRate: number;
  failureRate: number;
  totalExecutions: number;
  confidenceScore: number;
  computedAt: string;
}

export interface FlakyTestsResponse {
  flakyTests: FlakyTest[];
}

export async function getFlakyTests(
  accessToken: string,
  repoId: string
): Promise<FlakyTest[]> {
  const res = await fetch(`${API_BASE_URL}/api/repositories/${repoId}/flaky-tests`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) {
    const errField = body?.error;
    if (typeof errField === "string") {
      throw new ApiError({ code: errField, message: errField, requestId: "" });
    }
    throw new ApiError(errField as ApiErrorBody["error"]);
  }
  return (body as FlakyTestsResponse).flakyTests;
}

export interface TestDetail {
  testId: string;
  repositoryId: string;
  suiteName: string;
  testName: string;
  failureRate: number;
  alternationRate: number;
  totalExecutions: number;
  classification: string;
  confidenceScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export async function getTestDetail(
  accessToken: string,
  repoId: string,
  testId: string
): Promise<TestDetail> {
  const res = await fetch(
    `${API_BASE_URL}/api/repositories/${repoId}/tests/${testId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const body = await res.json();
  if (!res.ok) {
    const errField = body?.error;
    if (typeof errField === "string") {
      throw new ApiError({ code: errField, message: errField, requestId: "" });
    }
    throw new ApiError(errField as ApiErrorBody["error"]);
  }
  return body as TestDetail;
}

export interface TimelineDay {
  date: string;
  passCount: number;
  failCount: number;
}

export interface TestTimelineResponse {
  testId: string;
  timeline: TimelineDay[];
}

export async function getTestTimeline(
  accessToken: string,
  repoId: string,
  testId: string
): Promise<TimelineDay[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/repositories/${repoId}/tests/${testId}/timeline`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const body = await res.json();
  if (!res.ok) {
    const errField = body?.error;
    if (typeof errField === "string") {
      throw new ApiError({ code: errField, message: errField, requestId: "" });
    }
    throw new ApiError(errField as ApiErrorBody["error"]);
  }
  return (body as TestTimelineResponse).timeline;
}