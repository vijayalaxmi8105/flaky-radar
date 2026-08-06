export type ExecutionStatus = "pass" | "fail" | "skip" | "error";

export interface TestExecution {
  status: ExecutionStatus;
}