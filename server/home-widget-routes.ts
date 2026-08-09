import type { Express, NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import {
  buildHomeWidgetPayload,
  type HomeWidgetServiceDeps,
} from "./home-widget-service";

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => unknown;

export type RegisterHomeWidgetRoutesOptions = {
  authMiddleware?: AuthMiddleware;
  serviceDeps?: HomeWidgetServiceDeps;
};

const defaultAuthMiddleware: AuthMiddleware = async (req, res, next) => {
  try {
    const { withSupabaseUser } = await import("./authMiddleware");
    return withSupabaseUser(req, res, next);
  } catch (error) {
    return next(error);
  }
};

function selectedReleaseIdFromQuery(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : "__invalid_selection__";
}

export function registerHomeWidgetRoutes(
  app: Express,
  options: RegisterHomeWidgetRoutesOptions = {},
): void {
  const authMiddleware = options.authMiddleware ?? defaultAuthMiddleware;

  app.get(
    "/api/widget/home-release",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Pragma", "no-cache");

      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      try {
        const payload = await buildHomeWidgetPayload({
          profile: req.dbUser,
          selectedReleaseId: selectedReleaseIdFromQuery(
            req.query.selectedReleaseId,
          ),
          deps: options.serviceDeps,
        });
        return res.json(payload);
      } catch (error) {
        console.error("[/api/widget/home-release] GET Error:", error);
        return res.status(500).json({
          message: "Failed to get home widget release",
        });
      }
    },
  );
}
