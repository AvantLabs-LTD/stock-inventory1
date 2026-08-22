import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits"
import { apiError, DomainError } from "@/lib/inventory-service"
const allowed = new Set(["application/pdf","image/png","image/jpeg","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}) {
  if(!await getSession(request))return unauthorizedResponse();const {id}=await context.params
  return Response.json({attachments:await db.attachment.findMany({where:{purchaseRequestId:id},select:{id:true,kind:true,fileName:true,contentType:true,sizeBytes:true,createdAt:true,uploadedBy:{select:{name:true}}},orderBy:{createdAt:"desc"}})})
}
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}) {
  const session=await getSession(request);if(!session)return unauthorizedResponse()
  if(!hasRole(session,"INVENTORY_MANAGER"))return forbiddenResponse()
  try{const {id}=await context.params;const form=await request.formData();const file=form.get("file")
    if(!(file instanceof File))throw new DomainError("FILE_REQUIRED","Select a file")
    if(file.size<=0||file.size>MAX_UPLOAD_BYTES)throw new DomainError("FILE_TOO_LARGE","File must be between 1 byte and 5 MB",413)
    if(!allowed.has(file.type))throw new DomainError("INVALID_FILE_TYPE","Unsupported attachment type")
    const name=file.name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,180)
    const attachment=await db.attachment.create({data:{purchaseRequestId:id,kind:String(form.get("kind")||"OTHER") as never,fileName:name,contentType:file.type,sizeBytes:file.size,data:Buffer.from(await file.arrayBuffer()),uploadedById:session.user.id},select:{id:true,kind:true,fileName:true,contentType:true,sizeBytes:true,createdAt:true}})
    return Response.json({attachment},{status:201})
  }catch(e){return apiError(e)}
}
