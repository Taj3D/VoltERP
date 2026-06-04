import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

// XSS sanitization — strip HTML tags from text inputs
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// Phone validation
function isValidPhone(phone: string): boolean {
  const bdPhone = /^\+?880\d{10}$/;
  const genericPhone = /^\+?[\d\s\-()]{7,15}$/;
  return bdPhone.test(phone.replace(/\s/g, '')) || genericPhone.test(phone.replace(/\s/g, ''));
}

// Email format validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// NID validation: 10-17 digit number
function isValidNID(nid: string): boolean {
  return /^\d{10,17}$/.test(nid.replace(/\s/g, ''));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Employees', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.employee.findUnique({
      where: { id },
      include: {
        designation: true,
        department: true,
        leaveAllocations: true,
        _count: { select: { leaves: true, srTargets: true, leaveAllocations: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant companyId validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Mask salary for SR and VAT Auditor
    const masked = (security.user.role === 'vat_auditor' || security.user.role === 'sr')
      ? maskForVatAuditor(item, security.user.role, ['baseSalary'])
      : item;

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Employees', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    const imgError = validateImageFields(body, ['photo', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Phone/email/NID format validation
    if (body.phone?.trim() && !isValidPhone(body.phone.trim())) {
      return NextResponse.json({ error: 'Invalid phone format' }, { status: 400 });
    }
    if (body.email?.trim() && !isValidEmail(body.email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    if (body.nidNumber?.trim() && !isValidNID(body.nidNumber.trim())) {
      return NextResponse.json({ error: 'Invalid NID format. Must be 10-17 digits.' }, { status: 400 });
    }

    // Standalone DOB 18+ validation: Person must be at least 18 years old today
    if (body.dateOfBirth) {
      const dob = new Date(body.dateOfBirth);
      const today = new Date();
      const minAgeDate = new Date(today);
      minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
      if (dob > minAgeDate) {
        return NextResponse.json(
          { error: `Personnel Validation Gate: Employee must be at least 18 years of age. Date of Birth provided (${dob.toLocaleDateString()}) indicates the individual is under the minimum age requirement.` },
          { status: 400 }
        );
      }
    }

    // Chronological Date Interlocks
    if (body.dateOfBirth && body.joiningDate) {
      const dob = new Date(body.dateOfBirth);
      const joining = new Date(body.joiningDate);
      const minJoiningAge = new Date(dob);
      minJoiningAge.setFullYear(minJoiningAge.getFullYear() + 18);
      if (joining < minJoiningAge) {
        return NextResponse.json(
          { error: `Joining Date violates minimum age requirement. Employee must be at least 18 years old at the time of joining. Date of Birth: ${dob.toLocaleDateString()}, Minimum eligible joining date: ${minJoiningAge.toLocaleDateString()}` },
          { status: 400 }
        );
      }
    }
    if (body.resignationDate && body.joiningDate) {
      const joining = new Date(body.joiningDate);
      const resignation = new Date(body.resignationDate);
      if (resignation <= joining) {
        return NextResponse.json(
          { error: 'Resignation/Termination Date must be strictly after Joining Date' },
          { status: 400 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation before any modification
      const existing = await tx.employee.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Unique Corporate Identifiers per tenant (exclude current record)
      if (body.nidNumber?.trim() && companyId) {
        const nidCollision = await tx.employee.findFirst({
          where: { companyId, nidNumber: body.nidNumber.trim(), isActive: true, id: { not: id } }
        });
        if (nidCollision) {
          throw new Error('Corporate Entity Collision: NID already registered under this company.');
        }
      }
      if (body.phone?.trim() && companyId) {
        const phoneCollision = await tx.employee.findFirst({
          where: { companyId, phone: body.phone.trim(), isActive: true, id: { not: id } }
        });
        if (phoneCollision) {
          throw new Error('Corporate Entity Collision: Phone number already registered under this company.');
        }
      }
      if (body.email?.trim() && companyId) {
        const emailCollision = await tx.employee.findFirst({
          where: { companyId, email: body.email.trim().toLowerCase(), isActive: true, id: { not: id } }
        });
        if (emailCollision) {
          throw new Error('Corporate Entity Collision: Email already registered under this company.');
        }
      }

      const record = await tx.employee.update({
        where: { id },
        data: {
          name: body.name !== undefined ? stripHtml(String(body.name)) : undefined,
          designationId: body.designationId,
          departmentId: body.departmentId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined,
          resignationDate: body.resignationDate ? new Date(body.resignationDate) : null,
          baseSalary: body.baseSalary !== undefined ? safeFinancialRound(Number(body.baseSalary)) : undefined,
          employeeType: body.employeeType || undefined,
          status: body.status || undefined,
          gender: nullIfEmpty(body.gender),
          bloodGroup: nullIfEmpty(body.bloodGroup),
          religion: body.religion !== undefined ? (body.religion ? stripHtml(String(body.religion)) : null) : undefined,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          fatherName: body.fatherName !== undefined ? (body.fatherName ? stripHtml(String(body.fatherName)) : null) : undefined,
          motherName: body.motherName !== undefined ? (body.motherName ? stripHtml(String(body.motherName)) : null) : undefined,
          spouseName: body.spouseName !== undefined ? (body.spouseName ? stripHtml(String(body.spouseName)) : null) : undefined,
          maritalStatus: nullIfEmpty(body.maritalStatus),
          nidNumber: nullIfEmpty(body.nidNumber),
          tinNumber: nullIfEmpty(body.tinNumber),
          phone: nullIfEmpty(body.phone),
          email: body.email !== undefined ? (body.email ? stripHtml(String(body.email)).toLowerCase() : null) : undefined,
          presentAddress: body.presentAddress !== undefined ? (body.presentAddress ? stripHtml(String(body.presentAddress)) : null) : undefined,
          permanentAddress: body.permanentAddress !== undefined ? (body.permanentAddress ? stripHtml(String(body.permanentAddress)) : null) : undefined,
          emergencyContact: nullIfEmpty(body.emergencyContact),
          emergencyContactName: body.emergencyContactName !== undefined ? (body.emergencyContactName ? stripHtml(String(body.emergencyContactName)) : null) : undefined,
          bankName: body.bankName !== undefined ? (body.bankName ? stripHtml(String(body.bankName)) : null) : undefined,
          bankAccountNo: nullIfEmpty(body.bankAccountNo),
          photo: nullIfEmpty(body.photo),
          nidFrontImage: nullIfEmpty(body.nidFrontImage),
          nidBackImage: nullIfEmpty(body.nidBackImage),
          referenceBy: body.referenceBy !== undefined ? (body.referenceBy ? stripHtml(String(body.referenceBy)) : null) : undefined,
          address: body.address !== undefined ? (body.address ? stripHtml(String(body.address)) : null) : undefined,
          isActive: body.isActive ?? true,
        },
        include: {
          designation: true,
          department: true,
          leaveAllocations: true,
          _count: { select: { leaves: true, srTargets: true, leaveAllocations: true } },
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.employeeCode} - ${record.name}`,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({ employeeCode: record.employeeCode, name: record.name }),
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error: any) {
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message === 'Cross-tenant access denied') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message?.includes('Corporate Entity Collision')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.message?.includes('minimum age') || error?.message?.includes('must be strictly after')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Employees', 'DELETE');
  if (!security.authorized) return security.response;

  // Only admin can delete employees
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Delete access denied. Only administrators can delete employee records.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.employee.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation before soft delete
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // FK check for active SR targets and active leaves
      const [activeSRTargets, activeLeaves] = await Promise.all([
        tx.sRTargetSetup.count({ where: { employeeId: id, isActive: true } }),
        tx.employeeLeave.count({ where: { employeeId: id, isActive: true } }),
      ]);

      if (activeSRTargets > 0 || activeLeaves > 0) {
        throw new Error(
          `Cannot delete: Employee is referenced by ${activeSRTargets} active SR target(s) and ${activeLeaves} active leave record(s)`
        );
      }

      // Soft delete
      await tx.employee.update({ where: { id }, data: { isActive: false } });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.employeeCode} - ${record.name}`,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({ employeeCode: record.employeeCode, name: record.name, softDelete: true }),
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message === 'Cross-tenant access denied') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
  }
}
