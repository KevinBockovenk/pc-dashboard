import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/auth/me", (req, res): void => {
  res.json({ authenticated: req.session?.authenticated === true });
});

router.post("/auth/login", (req, res): void => {
  const { password } = req.body as { password?: string };
  const expected = process.env["DASHBOARD_PASSWORD"];

  if (!expected) {
    res.status(503).json({ error: "Server is not configured with a dashboard password." });
    return;
  }

  if (!password || password !== expected) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  req.session.authenticated = true;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to save session." });
      return;
    }
    res.json({ ok: true });
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

export default router;
