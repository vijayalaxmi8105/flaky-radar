import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server.js"; // was "../../app.js" ADJUST: path to your Express app export
import { prisma } from "@flaky-radar/db";
import { signAccessToken } from "../../auth/jwt.js";
import path from "path/win32";

describe("repo-level access control", () => {
  let memberUserId: string;
  let repoWithAccessId: string;
  let repoWithoutAccessId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: "member-test@example.com", role: "member" },
    });
    memberUserId = user.id;

    const repoA = await prisma.repository.create({
      data: { githubId: BigInt(999001), owner: "test-org", name: "repo-a", fullName: "test-org/repo-a" },
    });
    const repoB = await prisma.repository.create({
      data: { githubId: BigInt(999002), owner: "test-org", name: "repo-b", fullName: "test-org/repo-b" },
    });
    repoWithAccessId = repoA.id;
    repoWithoutAccessId = repoB.id;

    await prisma.userRepositoryAccess.create({
      data: { userId: memberUserId, repositoryId: repoWithAccessId, role: "member" },
    });
    // deliberately no row created for repoWithoutAccessId
  });

  afterAll(async () => {
    await prisma.userRepositoryAccess.deleteMany({ where: { userId: memberUserId } });
    await prisma.repository.deleteMany({ where: { id: { in: [repoWithAccessId, repoWithoutAccessId] } } });
    await prisma.user.delete({ where: { id: memberUserId } });
  });

  it("returns 403 for a member with no user_repository_access row for the repo", async () => {
    const token = signAccessToken({ sub: memberUserId, role: "member" });

    const res = await request(app)
      .get(`/api/repositories/${repoWithoutAccessId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_repo_access");
  });

  it("returns 200 for a member with a matching user_repository_access row", async () => {
    const token = signAccessToken({ sub: memberUserId, role: "member" });

    const res = await request(app)
      .get(`/api/repositories/${repoWithAccessId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});