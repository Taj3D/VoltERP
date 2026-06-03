import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Default credentials for all 5 RBAC roles
const DEFAULT_USERS = [
  { email: "emart.amit", name: "Amit Sharma", password: "Test_123", role: "admin", isActive: true },
  { email: "emart.manager", name: "Rakib Hasan", password: "Manager_123", role: "manager", isActive: true },
  { email: "emart.sr", name: "Kamal Hossain", password: "SR_123", role: "sr", isActive: true },
  { email: "emart.dealer", name: "Rahim Uddin", password: "Dealer_123", role: "dealer", isActive: true },
  { email: "emart.vat", name: "Kashem Miah", password: "VAT_123", role: "vat_auditor", isActive: true },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email || body.username;
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    // Auto-seed all default users if they don't exist
    for (const userData of DEFAULT_USERS) {
      const existing = await db.user.findUnique({ where: { email: userData.email } });
      if (!existing) {
        try {
          await db.user.create({ data: userData });
        } catch (e) {
          console.error(`Auto-seed user ${userData.email} failed:`, e);
        }
      }
    }

    // Now look up the user
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Simple password check (in production, use bcrypt)
    if (user.password !== password) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Log the login
    try {
      await db.auditLog.create({
        data: {
          action: "LOGIN",
          module: "Auth",
          userId: user.id,
          userName: user.name,
          recordLabel: user.email,
        },
      });
    } catch {}

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.name, // Explicit displayName so clients never fall back to email
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
