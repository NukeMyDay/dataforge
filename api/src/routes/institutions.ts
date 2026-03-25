import { Hono } from "hono";

export const institutionsRouter = new Hono();

institutionsRouter.get("/", (c) => {
  return c.json({ data: [], pagination: { page: 1, pageSize: 50, total: 0 } });
});

institutionsRouter.get("/:id", (c) => {
  return c.json({ error: "Not found" }, 404);
});
