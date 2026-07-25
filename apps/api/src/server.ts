import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
