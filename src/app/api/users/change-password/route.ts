import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/users/change-password — Change user password (admin only)
export async function POST(req: NextRequest) {
  try {
    const userEmail = req.headers.get('X-User-Email');
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    // Look up the requesting user
    const user = await db.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Verify current password
    if (user.password !== currentPassword) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // CRITICAL RBAC: Only administrators can change passwords
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can change passwords' },
        { status: 403 }
      );
    }

    // Password complexity validation
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long' },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'New password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'New password must contain at least one number' },
        { status: 400 }
      );
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/\?]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'New password must contain at least one special character' },
        { status: 400 }
      );
    }

    // Update the password
    await db.user.update({
      where: { id: user.id },
      data: {
        password: newPassword,
      },
    });

    // Create an AuditLog entry
    try {
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Auth',
          recordId: user.id,
          recordLabel: 'Password Change',
          userId: user.id,
          userName: user.name,
        },
      });
    } catch {
      // Audit log creation should not block the password change
    }

    // Log to user activity (using AuditLog as UserActivityLog model doesn't exist)
    try {
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Auth-Password',
          recordId: user.id,
          recordLabel: 'Password Change Activity',
          userId: user.id,
          userName: user.name,
          details: 'Password changed successfully',
        },
      });
    } catch {
      // Activity log should not block the response
    }

    return NextResponse.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
