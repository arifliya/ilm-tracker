import request from "supertest";
import { app } from "../app";

describe("app", () => {
  it("responds on GET /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "ilm backend running" });
  });
});
