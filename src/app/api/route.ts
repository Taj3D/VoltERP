import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    application: "VoltERP",
    version: "1.0.0",
    status: "running",
  });
}
