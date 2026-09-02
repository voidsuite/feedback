/**
 * /api/threads/:id/vote — upvotes for feature requests / questions.
 */

import { Hono } from "hono"
import { getSessionUser, isAdmin } from "../lib/auth.js"
import { getThread, vote, unvote } from "../lib/threads.js"

const votes = new Hono()

votes.post("/:id/vote", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const thread = getThread(c.req.param("id"), { id: user.id, isAdmin: isAdmin(user) })
  if (!thread) return c.json({ error: "Not found" }, 404)
  const result = vote(thread.id, user.id)
  return c.json(result)
})

votes.delete("/:id/vote", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const thread = getThread(c.req.param("id"), { id: user.id, isAdmin: isAdmin(user) })
  if (!thread) return c.json({ error: "Not found" }, 404)
  const result = unvote(thread.id, user.id)
  return c.json(result)
})

export default votes
