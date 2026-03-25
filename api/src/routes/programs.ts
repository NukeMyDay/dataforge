import { Hono } from "hono";

export const programsRouter = new Hono();

programsRouter.get("/", (c) => {
  // TODO: query db and return paginated programs
  return c.json({ data: [], pagination: { page: 1, pageSize: 50, total: 0 } });
});

programsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  // TODO: query db for program by id
  return c.json({ error: "Not found" }, 404);
});
