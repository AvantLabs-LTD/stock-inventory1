"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Search, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type UserRole = "SUPER_ADMIN" | "INVENTORY_MANAGER" | "PURCHASE_APPROVER" | "USER"
type ManagedUser = { id:string; email:string; name:string; role:UserRole; status:string; createdAt:string; updatedAt:string }
const roles: Array<{value:UserRole;label:string;description:string}> = [
  {value:"SUPER_ADMIN",label:"Super Admin",description:"Full system and user administration"},
  {value:"INVENTORY_MANAGER",label:"Inventory Manager",description:"Catalogue, stock, demands, purchasing and receiving"},
  {value:"PURCHASE_APPROVER",label:"Purchase Approver",description:"Reviews and approves orders"},
  {value:"USER",label:"User",description:"Catalogue access and demand submission"},
]
const roleLabel=(role:UserRole)=>roles.find(item=>item.value===role)?.label||role

async function userFetch(url:string,init?:RequestInit){
  const response=await fetch(url,init), body=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(body.error||"Request failed")
  return body
}

function UserFields({user}:{user?:ManagedUser}){
  return <div className="grid gap-4 py-2">
    <div className="grid gap-2"><Label htmlFor={user?"edit-name":"create-name"}>Full name</Label><Input id={user?"edit-name":"create-name"} name="name" defaultValue={user?.name} autoComplete="off" required/></div>
    {!user&&<div className="grid gap-2"><Label htmlFor="create-email">Email address</Label><Input id="create-email" name="email" type="email" autoComplete="off" required/></div>}
    <div className="grid gap-2"><Label>Access role</Label><Select name="role" defaultValue={user?.role||"USER"}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{roles.map(role=><SelectItem key={role.value} value={role.value}><span className="font-medium">{role.label}</span><span className="ml-2 text-xs text-muted-foreground">{role.description}</span></SelectItem>)}</SelectContent></Select></div>
    {user&&<div className="grid gap-2"><Label>Account status</Label><Select name="status" defaultValue={user.status}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active — can sign in</SelectItem><SelectItem value="INACTIVE">Inactive — access suspended</SelectItem></SelectContent></Select></div>}
    <div className="grid gap-2"><Label htmlFor={user?"edit-password":"create-password"}>{user?"Reset password":"Temporary password"}</Label><Input id={user?"edit-password":"create-password"} name="password" type="password" minLength={12} autoComplete="new-password" required={!user} placeholder={user?"Leave blank to keep the current password":"At least 12 characters"}/><p className="text-xs text-muted-foreground">{user?"Only enter a value when issuing a new password.":"Share this securely; the password is never displayed again."}</p></div>
  </div>
}

export function UsersPage(){
  const currentUser=useAuthStore(state=>state.user)
  const [users,setUsers]=useState<ManagedUser[]>([]),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[createOpen,setCreateOpen]=useState(false),[editing,setEditing]=useState<ManagedUser|null>(null),[saving,setSaving]=useState(false)
  const load=useCallback(async()=>{setLoading(true);try{setUsers((await userFetch("/api/v1/users")).users)}catch(error){toast.error((error as Error).message)}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return needle?users.filter(user=>[user.name,user.email,roleLabel(user.role),user.status].join(" ").toLowerCase().includes(needle)):users},[query,users])
  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);const form=new FormData(event.currentTarget);try{await userFetch("/api/v1/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(form))});toast.success("User account created");setCreateOpen(false);await load()}catch(error){toast.error((error as Error).message)}finally{setSaving(false)}}
  async function update(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!editing)return;setSaving(true);const form=new FormData(event.currentTarget);try{await userFetch(`/api/v1/users/${editing.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(form))});toast.success("User access updated");setEditing(null);await load()}catch(error){toast.error((error as Error).message)}finally{setSaving(false)}}
  const active=users.filter(user=>user.status==="ACTIVE").length, privileged=users.filter(user=>user.status==="ACTIVE"&&user.role!=="USER").length
  return <div className="space-y-6"><PageHeader title="User management" description="Create accounts and control application access without sharing administrator credentials." icon={Users}><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><UserPlus className="mr-2 size-4"/>Add user</Button></DialogTrigger><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Create user account</DialogTitle><DialogDescription>Assign only the access needed for this person’s responsibilities.</DialogDescription></DialogHeader><form onSubmit={create}><UserFields/><DialogFooter><Button type="button" variant="outline" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button disabled={saving}>{saving?"Creating…":"Create account"}</Button></DialogFooter></form></DialogContent></Dialog></PageHeader>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5"><Users className="size-5 text-primary"/></div><div><div className="text-2xl font-semibold">{users.length}</div><div className="text-xs text-muted-foreground">Total accounts</div></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-emerald-500/10 p-2.5"><ShieldCheck className="size-5 text-emerald-600"/></div><div><div className="text-2xl font-semibold">{active}</div><div className="text-xs text-muted-foreground">Active accounts</div></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-amber-500/10 p-2.5"><UserCog className="size-5 text-amber-600"/></div><div><div className="text-2xl font-semibold">{privileged}</div><div className="text-xs text-muted-foreground">Elevated accounts</div></div></CardContent></Card></div>
    <Card className="overflow-hidden"><div className="border-b p-4"><div className="relative max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by name, email, role or status…"/></div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/40"><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Access</TableHead></TableRow></TableHeader><TableBody>{filtered.map(user=>{const initials=user.name.split(" ").map(part=>part[0]).join("").slice(0,2).toUpperCase();return <TableRow key={user.id} className="hover:bg-muted/30"><TableCell><div className="flex items-center gap-3"><Avatar className="size-9"><AvatarFallback>{initials}</AvatarFallback></Avatar><div><div className="font-medium">{user.name}{user.id===currentUser?.id&&<span className="ml-2 text-xs text-muted-foreground">You</span>}</div><div className="text-xs text-muted-foreground">{user.email}</div></div></div></TableCell><TableCell><Badge variant={user.role==="SUPER_ADMIN"?"default":"secondary"}>{roleLabel(user.role)}</Badge></TableCell><TableCell><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${user.status==="ACTIVE"?"bg-emerald-500":"bg-muted-foreground/40"}`}/>{user.status==="ACTIVE"?"Active":"Inactive"}</div></TableCell><TableCell className="text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={()=>setEditing(user)}><UserCog className="mr-2 size-4"/>Manage</Button></TableCell></TableRow>})}</TableBody></Table></div>{!loading&&!filtered.length&&<div className="py-14 text-center text-sm text-muted-foreground">No users match this search.</div>}{loading&&<div className="py-14 text-center text-sm text-muted-foreground">Loading users…</div>}</Card>
    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open)setEditing(null)}}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Manage user access</DialogTitle><DialogDescription>{editing?.email}{editing?.id===currentUser?.id?" · Your own Super Admin access cannot be removed.":""}</DialogDescription></DialogHeader>{editing&&<form onSubmit={update}><UserFields key={editing.id} user={editing}/><DialogFooter><Button type="button" variant="outline" onClick={()=>setEditing(null)}>Cancel</Button><Button disabled={saving}>{saving?"Saving…":"Save changes"}</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>
}
