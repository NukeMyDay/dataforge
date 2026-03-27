import { Hono } from "hono";

export const statsRouter = new Hono();

statsRouter.get("/", async (c) => {
  return c.json({
    data: {
      programCount: 0,
      institutionCount: 0,
      regulationCount: 0,
      countryCount: 0,
      lastUpdated: null,
    },
  });
});
