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
      designation: user.designation || "",
      photo: user.photo || "",
      voterIdFront: user.voterIdFront || "",
      voterIdBack: user.voterIdBack || "",
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
    const { name, phone, address, designation, photo, voterIdFront, voterIdBack } = body;

    // Validate name
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    // Validate photo size — 5MB raw file ≈ 7MB base64 string (with ~33% overhead + data URL prefix)
    if (photo && photo.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: "Profile photo is too large (max 5MB)" }, { status: 400 });
    }
    if (voterIdFront && voterIdFront.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: "Voter ID front image is too large (max 5MB)" }, { status: 400 });
    }
    if (voterIdBack && voterIdBack.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: "Voter ID back image is too large (max 5MB)" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim() || null;
    if (address !== undefined) updateData.address = address.trim() || null;
    if (designation !== undefined) updateData.designation = designation.trim() || null;
    if (photo !== undefined) updateData.photo = photo || null;
    if (voterIdFront !== undefined) updateData.voterIdFront = voterIdFront || null;
    if (voterIdBack !== undefined) updateData.voterIdBack = voterIdBack || null;

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
      designation: updatedUser.designation || "",
      photo: updatedUser.photo || "",
      voterIdFront: updatedUser.voterIdFront || "",
      voterIdBack: updatedUser.voterIdBack || "",
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
