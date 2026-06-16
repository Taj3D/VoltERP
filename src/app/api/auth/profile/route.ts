// ============================================================
// AUTH PROFILE API — User Profile Management
// GET: Retrieve current user's profile (including photo, phone, address)
// PUT: Update current user's profile (name, photo, phone, address)
// All actions are audited via logUserActivity with token "Sys-Profile-Core"
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity, invalidateUserCache } from "@/lib/api-security";
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
        photo: true,
        voterIdFront: true,
        voterIdBack: true,
        phone: true,
        address: true,
        designation: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        pdfExports: true,
        csvImports: true,
        csvExports: true,
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
    const { name, photo, phone, address, designation, voterIdFront, voterIdBack } = body;

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

    if (photo !== undefined) {
      // Validate base64 data URL format if provided
      if (photo !== null && photo !== "") {
        if (typeof photo !== "string") {
          return NextResponse.json(
            { error: "Profile photo must be a valid base64 data URL." },
            { status: 400 }
          );
        }
        // Check max size — 5MB raw file ≈ 7MB base64 string (with ~33% overhead + data URL prefix)
        const maxBase64Length = 7 * 1024 * 1024;
        if (photo.length > maxBase64Length) {
          return NextResponse.json(
            { error: "Profile photo must be smaller than 5MB." },
            { status: 400 }
          );
        }
      }
      updateData.photo = photo;
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

    if (address !== undefined) {
      if (address !== null && typeof address !== "string") {
        return NextResponse.json(
          { error: "Address must be a valid string." },
          { status: 400 }
        );
      }
      updateData.address = address;
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

    if (voterIdFront !== undefined) {
      if (voterIdFront !== null && voterIdFront !== "") {
        if (typeof voterIdFront !== "string") {
          return NextResponse.json(
            { error: "Voter ID front must be a valid base64 data URL." },
            { status: 400 }
          );
        }
        const maxBase64Length = 7 * 1024 * 1024;
        if (voterIdFront.length > maxBase64Length) {
          return NextResponse.json(
            { error: "Voter ID front image must be smaller than 5MB." },
            { status: 400 }
          );
        }
      }
      updateData.voterIdFront = voterIdFront;
    }

    if (voterIdBack !== undefined) {
      if (voterIdBack !== null && voterIdBack !== "") {
        if (typeof voterIdBack !== "string") {
          return NextResponse.json(
            { error: "Voter ID back must be a valid base64 data URL." },
            { status: 400 }
          );
        }
        const maxBase64Length = 7 * 1024 * 1024;
        if (voterIdBack.length > maxBase64Length) {
          return NextResponse.json(
            { error: "Voter ID back image must be smaller than 5MB." },
            { status: 400 }
          );
        }
      }
      updateData.voterIdBack = voterIdBack;
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

    // Invalidate cached user so next request fetches fresh data
    invalidateUserCache(existingUser.id);

    const updatedUser = await db.user.update({
      where: { id: existingUser.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        photo: true,
        voterIdFront: true,
        voterIdBack: true,
        phone: true,
        address: true,
        designation: true,
        pdfExports: true,
        csvImports: true,
        csvExports: true,
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
