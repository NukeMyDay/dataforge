import { Hono } from "hono";

export const regulationsRouter = new Hono();

regulationsRouter.get("/", (c) => {
  return c.json({ data: [], pagination: { page: 1, pageSize: 50, total: 0 } });
});

regulationsRouter.get("/:slug", (c) => {
  return c.json({ error: "Not found" }, 404);
});
