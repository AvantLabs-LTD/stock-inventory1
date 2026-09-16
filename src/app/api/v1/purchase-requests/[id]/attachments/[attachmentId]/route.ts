import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request:NextRequest,context:{params:Promise<{id:string;attachmentId:string}>}) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.documents.view")) return forbiddenResponse();const {id,attachmentId}=await context.params
  const file=await db.attachment.findFirst({where:{id:attachmentId,purchaseRequestId:id}})
  if(!file)return Response.json({error:"Attachment not found"},{status:404})
  const safe=file.fileName.replace(/[\r\n"]/g,"_")
  return new Response(file.data,{headers:{"Content-Type":file.contentType,"Content-Length":String(file.sizeBytes),"Content-Disposition":'attachment; filename="'+safe+'"',"X-Content-Type-Options":"nosniff"}})
}
export async function DELETE(request:NextRequest,context:{params:Promise<{id:string;attachmentId:string}>}) {
  const session=await getSession(request);if(!session)return unauthorizedResponse()
  if(!hasPermission(session,"vault.documents.manage"))return forbiddenResponse();const {id,attachmentId}=await context.params
  const result=await db.attachment.deleteMany({where:{id:attachmentId,purchaseRequestId:id}})
  return result.count?new Response(null,{status:204}):Response.json({error:"Attachment not found"},{status:404})
}
