import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pcsRouter from "./pcs";
import downloadRouter from "./download";
import authRouter from "./auth";
import { requireAuth } from "../middleware/require-auth";

const router: IRouter = Router();

// Public routes — no auth required
router.use(healthRouter);
router.use(authRouter);
router.use(downloadRouter);

// Protected routes — must be authenticated
router.use(requireAuth);
router.use(pcsRouter);

export default router;
