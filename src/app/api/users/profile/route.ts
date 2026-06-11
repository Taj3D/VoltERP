import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiSecurity } from "@/lib/api-security";

// GET /api/users/profile - Fetch the current user's profile
export async function GET(req: NextRequest) {
  const security = await withApiSecurity(req, "UserProfile", "GET");
  if (!security.authorized) return security.response;

  try {
    const user = await db.user.findUnique({ where: { email: security.user.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      address: user.address || "",
      photo: user.photo || "",
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      pdfExports: user.pdfExports,
      csvImports: user.csvImports,
      csvExports: user.csvExports,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// PUT /api/users/profile - Update the current user's profile
export async function PUT(req: NextRequest) {
  const security = await withApiSecurity(req, "UserProfile", "PUT");
  if (!security.authorized) return security.response;

  try {
    const user = await db.user.findUnique({ where: { email: security.user.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, phone, address, photo } = body;

    // Validate name
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    // Validate photo size — 5MB raw file ≈ 7MB base64 string (with ~33% overhead + data URL prefix)
    if (photo && photo.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: "Profile photo is too large (max 5MB)" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim() || null;
    if (address !== undefined) updateData.address = address.trim() || null;
    if (photo !== undefined) updateData.photo = photo || null;

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Log the profile update
    try {
      await db.auditLog.create({
        data: {
          action: "UPDATE",
          module: "Profile",
          userId: user.id,
          userName: user.name,
          recordLabel: `Profile updated for ${user.email}`,
          details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
        },
      });
    } catch { /* silent */ }

    return NextResponse.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone || "",
      address: updatedUser.address || "",
      photo: updatedUser.photo || "",
      role: updatedUser.role,
      pdfExports: updatedUser.pdfExports,
      csvImports: updatedUser.csvImports,
      csvExports: updatedUser.csvExports,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
