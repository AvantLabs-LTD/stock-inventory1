import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"
import { getSession } from "../../src/lib/auth-middleware"
import { issueServiceToken } from "../../src/lib/service-tokens"
import { GET as getCargo, POST as postCargo } from "../../src/app/api/v1/cargo/route"
import { DELETE as revokeToken, GET as listTokens, POST as createToken } from "../../src/app/api/v1/service-tokens/route"
import { COOKIE_NAME, createSessionToken } from "../../src/lib/auth"

const enabled = Boolean(process.env.DATABASE_URL)
const prisma = new PrismaClient()

test("service token scopes are bounded by live groups and revocation", { skip: !enabled }, async () => {
  const suffix = Date.now().toString()
  const user = await prisma.user.create({ data: { email: `cargo-token-${suffix}@test.local`, name: "Cargo API Test", password: "not-used", accessGroups: { create: { groupId: "cargo_viewer" } } } })
  const token = issueServiceToken()
  await prisma.serviceToken.create({ data: { id: token.id, userId: user.id, name: "Test client", tokenHash: token.tokenHash, scopes: ["cargo.view"], expiresAt: new Date(Date.now() + 60_000) } })
  const request = new NextRequest("http://localhost/api/v1/cargo", { headers: { authorization: `Bearer ${token.plaintext}` } })
  const session = await getSession(request)
  assert.equal(session?.credential.type, "service_token")
  assert.deepEqual(session?.user.permissions, ["cargo.view"])
  const list = await getCargo(new NextRequest("http://localhost/api/v1/cargo?view=shipments&limit=2", { headers: { authorization: `Bearer ${token.plaintext}` } }))
  assert.equal(list.status, 200)
  const page = await list.json()
  assert.ok(Array.isArray(page.shipments))
  assert.ok("nextCursor" in page)
  const invalidLimit = await getCargo(new NextRequest("http://localhost/api/v1/cargo?view=shipments&limit=bad", { headers: { authorization: `Bearer ${token.plaintext}` } }))
  assert.equal(invalidLimit.status, 400)
  assert.equal((await invalidLimit.json()).code, "INVALID_LIMIT")
  await prisma.userAccessGroup.delete({ where: { userId_groupId: { userId: user.id, groupId: "cargo_viewer" } } })
  assert.deepEqual((await getSession(request))?.user.permissions, [])
  assert.equal((await getCargo(request)).status, 403)
  await prisma.serviceToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } })
  assert.equal(await getSession(request), null)
})

test("bearer-authenticated Cargo write replays the original response", { skip: !enabled }, async () => {
  const suffix = Date.now().toString()
  const user = await prisma.user.create({ data: { email: `cargo-write-token-${suffix}@test.local`, name: "Cargo Writer", password: "not-used", accessGroups: { create: { groupId: "cargo_operator" } } } })
  const token = issueServiceToken()
  await prisma.serviceToken.create({ data: { id: token.id, userId: user.id, name: "Test writer", tokenHash: token.tokenHash, scopes: ["cargo.view", "cargo.shipments.manage"], expiresAt: new Date(Date.now() + 60_000) } })
  const headers = { authorization: `Bearer ${token.plaintext}`, "idempotency-key": `cargo-route-${suffix}`, "content-type": "application/json" }
  const makeRequest = (route: string) => new NextRequest("http://localhost/api/v1/cargo", { method: "POST", headers, body: JSON.stringify({ action: "shipment.create", data: { route } }) })
  const first = await postCargo(makeRequest("DIRECT"))
  assert.equal(first.status, 200)
  const firstId = (await first.json()).result.id
  const repeated = await postCargo(makeRequest("DIRECT"))
  assert.equal((await repeated.json()).result.id, firstId)
  const changed = await postCargo(makeRequest("FORWARDED"))
  assert.equal(changed.status, 409)
  assert.equal((await changed.json()).code, "IDEMPOTENCY_KEY_CONFLICT")
  assert.equal(await prisma.cargoShipment.count({ where: { id: firstId } }), 1)
})

test("interactive administrator issues and revokes a scoped token", { skip: !enabled }, async () => {
  const previousSecret = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = "integration-test-only-secret-0123456789abcdef0123456789abcdef"
  try {
    const suffix = Date.now().toString()
    const admin = await prisma.user.create({ data: { email: `token-admin-${suffix}@test.local`, name: "Token Admin", password: "not-used", accessGroups: { create: { groupId: "flux_admin" } } } })
    const target = await prisma.user.create({ data: { email: `token-target-${suffix}@test.local`, name: "Token Target", password: "not-used", accessGroups: { create: { groupId: "cargo_viewer" } } } })
    const jwt = await createSessionToken({ userId: admin.id, email: admin.email })
    const headers = { cookie: `${COOKIE_NAME}=${jwt}`, "content-type": "application/json" }
    const invalid = await createToken(new NextRequest("http://localhost/api/v1/service-tokens", { method: "POST", headers, body: JSON.stringify({ userId: target.id, name: "Too broad", scopes: ["cargo.shipments.manage"], expiresInDays: 30 }) }))
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).code, "INVALID_SCOPE")
    const created = await createToken(new NextRequest("http://localhost/api/v1/service-tokens", { method: "POST", headers, body: JSON.stringify({ userId: target.id, name: "Read-only client", scopes: ["cargo.view"], expiresInDays: 30 }) }))
    assert.equal(created.status, 201)
    const body = await created.json()
    assert.match(body.token, /^flux_/)
    const stored = await prisma.serviceToken.findUniqueOrThrow({ where: { id: body.id } })
    assert.notEqual(stored.tokenHash, body.token)
    const listed = await listTokens(new NextRequest("http://localhost/api/v1/service-tokens", { headers }))
    assert.equal(listed.status, 200)
    assert.ok(!(await listed.text()).includes(body.token))
    const revoked = await revokeToken(new NextRequest(`http://localhost/api/v1/service-tokens?id=${body.id}`, { method: "DELETE", headers }))
    assert.equal(revoked.status, 200)
    assert.ok((await prisma.serviceToken.findUniqueOrThrow({ where: { id: body.id } })).revokedAt)
  } finally {
    if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previousSecret
  }
})
