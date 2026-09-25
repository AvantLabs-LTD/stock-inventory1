import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import test from "node:test"
import { db } from "../../src/lib/db"
import { commitPlanningChanges } from "../../src/lib/manufacturing-definitions-service"

test("planning publication preserves accepted revisions, is idempotent and rolls back a mixed invalid batch",{skip:!process.env.DATABASE_URL},async()=>{
  const suffix=randomUUID()
  const actor=await db.user.create({data:{email:`planning-${suffix}@test.local`,name:"Planning integration",password:randomUUID(),role:"INVENTORY_MANAGER"}})
  const item=await db.item.create({data:{code:`PLAN-${suffix}`,title:"Planning component",discipline:"MECHANICAL",unit:"pcs",createdById:actor.id}})
  const bom=await db.billOfMaterial.create({data:{name:`Planning ${suffix}`,itemId:item.id,createdById:actor.id}})
  const base=await db.bomVersion.create({data:{bomId:bom.id,revision:"accepted",status:"ACTIVE",createdById:actor.id,lines:{create:{sourceLineKey:"1",itemId:item.id,quantity:"2",unit:"pcs"}}}})
  const lines=[{sourceLineKey:"1",parentSourceLineKey:null,itemId:item.id,quantity:"3",unit:"pcs"}]
  const body={note:"Scenario review",revisions:[{versionId:base.id,lines}]},key=`planning-${suffix}`
  const first=await commitPlanningChanges(body,actor,key),second=await commitPlanningChanges(body,actor,key)
  assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(second)))
  assert.equal(await db.bomVersion.count({where:{bomId:bom.id,status:"DRAFT"}}),1)
  assert.equal((await db.bomLine.findFirstOrThrow({where:{bomVersionId:base.id}})).quantity.toString(),"2")
  assert.equal((await db.bomVersion.findUniqueOrThrow({where:{id:base.id}})).status,"ACTIVE")
  await assert.rejects(commitPlanningChanges({note:"Must roll back",revisions:[{versionId:base.id,lines},{versionId:"missing",lines}]},actor,`rollback-${suffix}`),/no longer active/)
  assert.equal(await db.bomVersion.count({where:{bomId:bom.id}}),2)
  assert.equal(await db.apiRequestKey.count({where:{actorId:actor.id,key:`rollback-${suffix}`}}),0)
})
