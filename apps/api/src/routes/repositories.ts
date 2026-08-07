import { Router } from "express";
import { prisma } from "@flaky-radar/db";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireRepoAccess } from "../middleware/requireRepoAccess.js";

const repositoriesRouter = Router();

repositoriesRouter.get(
  "/repositories/:repoId",
  authenticate,
  requireRole("admin", "member", "viewer"),
  requireRepoAccess,
  async (req, res) => {
    try {
      const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
      if (!repoId) {
        return res.status(400).json({ error: "missing_repo_id" });
      }

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) return res.status(404).json({ error: "not_found" });
      res.json({ ...repo, githubId: repo.githubId.toString() });
    } catch (err) {
      console.error("GET /repositories/:repoId failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  }
);

export { repositoriesRouter };