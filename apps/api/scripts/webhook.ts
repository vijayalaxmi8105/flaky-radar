import crypto from "node:crypto";

const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "local_dev_secret_123";
const payload = JSON.stringify({ action: "completed", workflow_run: { id: 123 } });

function sign(body: string) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function main() {
  const validSig = sign(payload);

  const validRes = await fetch("http://localhost:3000/webhooks/github", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": validSig,
    },
    body: payload,
  });
  console.log("Valid signature ->", validRes.status, await validRes.text());

  const tamperedPayload = payload.replace("completed", "requested");
  const tamperedRes = await fetch("http://localhost:3000/webhooks/github", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": validSig,
    },
    body: tamperedPayload,
  });
  console.log("Tampered payload ->", tamperedRes.status, await tamperedRes.text());

  const badSigRes = await fetch("http://localhost:3000/webhooks/github", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=deadbeef",
    },
    body: payload,
  });
  console.log("Bad signature ->", badSigRes.status, await badSigRes.text());
}

main();