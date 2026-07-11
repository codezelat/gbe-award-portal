import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
export const runtime="nodejs";
async function handler(request:Request){ try{return getAuth().handler(request);}catch{return NextResponse.json({message:"Authentication is not configured."},{status:503});} }
export {handler as GET,handler as POST};
