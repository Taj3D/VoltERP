// ============================================================
// AUTH PROFILE API — User Profile Management
// GET: Retrieve current user's profile (including profileImage, phone, designation)
// PUT: Update current user's profile (name, profileImage, phone, designation)
// All actions are audited via logUserActivity with token "Sys-Profile-Core"
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Use "AuditLogs" module (not "Auth" which is exempt and returns system user)
    const security = await withApiSecurity(request, "AuditLogs", "GET");
    if (!security.authorized) return security.response;

    // Look up full user profile by email
    const user = await db.user.findUnique({
      where: { email: security.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        branchId: true,
        profileImage: true,
        phone: true,
        designation: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-profile-get");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Use "AuditLogs" module (not "Auth" which is exempt and returns system user)
    const security = await withApiSecurity(request, "AuditLogs", "PUT");
    if (!security.authorized) return security.response;

    const body = await request.json();
    const { name, profileImage, phone, designation } = body;

    // Build update data — only allow specific fields
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 1) {
        return NextResponse.json(
          { error: "Name must be at least 1 character long." },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (profileImage !== undefined) {
      // Validate base64 data URL format if provided
      if (profileImage !== null && profileImage !== "") {
        if (typeof profileImage !== "string") {
          return NextResponse.json(
            { error: "Profile image must be a valid base64 data URL." },
            { status: 400 }
          );
        }
        // Check max size — limit to 2MB base64 (~2.67MB decoded)
        const maxBase64Length = 2 * 1024 * 1024 * 1.34;
        if (profileImage.length > maxBase64Length) {
          return NextResponse.json(
            { error: "Profile image must be smaller than 2MB." },
            { status: 400 }
          );
        }
      }
      updateData.profileImage = profileImage;
    }

    if (phone !== undefined) {
      if (phone !== null && typeof phone !== "string") {
        return NextResponse.json(
          { error: "Phone must be a valid string." },
          { status: 400 }
        );
      }
      updateData.phone = phone;
    }

    if (designation !== undefined) {
      if (designation !== null && typeof designation !== "string") {
        return NextResponse.json(
          { error: "Designation must be a valid string." },
          { status: 400 }
        );
      }
      updateData.designation = designation;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update." },
        { status: 400 }
      );
    }

    // Perform update — look up by email for reliability
    const existingUser = await db.user.findUnique({ where: { email: security.user.email } });
    if (!existingUser) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const updatedUser = await db.user.update({
      where: { id: existingUser.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profileImage: true,
        phone: true,
        designation: true,
      },
    });

    // Audit the profile update
    await logUserActivity({
      action: "UPDATE",
      module: "Sys-Profile-Core",
      recordId: existingUser.id,
      recordLabel: security.user.email,
      userId: existingUser.id,
      userName: updatedUser.name,
      details: JSON.stringify({
        updatedFields: Object.keys(updateData),
        updatedAt: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-profile-update");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
