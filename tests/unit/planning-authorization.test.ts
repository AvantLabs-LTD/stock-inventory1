import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"
import { GET } from "../../src/app/api/v1/manufacturing/planning/snapshot/route"
import { POST } from "../../src/app/api/v1/manufacturing/planning/commit/route"

test("planning evidence and BOM publication require authentication",async()=>{
  const headers={authorization:"Unsupported anonymous"}
  assert.equal((await GET(new NextRequest("http://localhost/api/v1/manufacturing/planning/snapshot",{headers}))).status,401)
  assert.equal((await POST(new NextRequest("http://localhost/api/v1/manufacturing/planning/commit",{method:"POST",headers}))).status,401)
})
