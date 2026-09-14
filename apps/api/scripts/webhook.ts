import crypto from "node:crypto";
const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "local_dev_secret_123";
const targetUrl = process.env.WEBHOOK_TARGET_URL ?? "http://localhost:3000/webhooks/github";
const payload = JSON.stringify({ action: "completed", workflow_run: { id: 123 } });
function sign(body: string) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}
async function main() {
  const validSig = sign(payload);
  const validRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": validSig,
      "X-GitHub-Delivery": crypto.randomUUID(),
      "X-GitHub-Event": "workflow_run",
    },
    body: payload,
  });
  console.log("Valid signature ->", validRes.status, await validRes.text());
  const tamperedPayload = payload.replace("completed", "requested");
  const tamperedRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": validSig,
      "X-GitHub-Delivery": crypto.randomUUID(),
      "X-GitHub-Event": "workflow_run",
    },
    body: tamperedPayload,
  });
  console.log("Tampered payload ->", tamperedRes.status, await tamperedRes.text());
  const badSigRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=deadbeef",
      "X-GitHub-Delivery": crypto.randomUUID(),
      "X-GitHub-Event": "workflow_run",
    },
    body: payload,
  });
  console.log("Bad signature ->", badSigRes.status, await badSigRes.text());
}
main();