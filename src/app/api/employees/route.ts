import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

// XSS sanitization — strip HTML tags from text inputs
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// Phone validation: Bangladesh format (+880XXXXXXXXXX) or generic
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

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Employees', 'GET');
  if (!security.authorized) return security.response;
  try {
    const companyId = security.user.companyId;
    const items = await db.employee.findMany({
      where: {
        ...(companyId ? { companyId, isActive: true } : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        designation: true,
        department: true,
        leaveAllocations: true,
        _count: { select: { leaves: true, srTargets: true, leaveAllocations: true } },
      },
    });

    // Mask salary for SR and VAT Auditor
    const maskedItems = items.map(item => {
      if (security.user.role === 'vat_auditor' || security.user.role === 'sr') {
        return maskForVatAuditor(item, security.user.role, ['baseSalary']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Employees', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results = await db.$transaction(async (tx) => {
        const created: any[] = [];
        for (const row of body.data) {
          const imgError = validateImageFields(row, ['photo', 'nidFrontImage', 'nidBackImage']);
          if (imgError) throw new Error(imgError);

          // Standalone DOB 18+ validation: Person must be at least 18 years old today
          if (row.dateOfBirth) {
            const dob = new Date(row.dateOfBirth);
            const today = new Date();
            const minAgeDate = new Date(today);
            minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
            if (dob > minAgeDate) {
              throw new Error(`Personnel Validation Gate: Employee must be at least 18 years of age. Date of Birth provided (${dob.toLocaleDateString()}) indicates the individual is under the minimum age requirement.`);
            }
          }

          // Chronological Date Interlocks for batch
          if (row.dateOfBirth && row.joiningDate) {
            const dob = new Date(row.dateOfBirth);
            const joining = new Date(row.joiningDate);
            const minJoiningAge = new Date(dob);
            minJoiningAge.setFullYear(minJoiningAge.getFullYear() + 18);
            if (joining < minJoiningAge) {
              throw new Error(`Joining Date violates minimum age requirement. Employee must be at least 18 years old at the time of joining. Date of Birth: ${dob.toLocaleDateString()}, Minimum eligible joining date: ${minJoiningAge.toLocaleDateString()}`);
            }
          }
          if (row.resignationDate && row.joiningDate) {
            const joining = new Date(row.joiningDate);
            const resignation = new Date(row.resignationDate);
            if (resignation <= joining) {
              throw new Error('Resignation/Termination Date must be strictly after Joining Date');
            }
          }

          // Auto-generate EMP-XXXXX code
          let employeeCode = row.employeeCode;
          if (!employeeCode) {
            const allEmployees = await tx.employee.findMany({ select: { employeeCode: true } });
            let nextNum = 1;
            for (const e of allEmployees) {
              const match = e.employeeCode?.match(/EMP-(\d+)/);
              if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
            }
            nextNum += created.length; // offset for batch
            employeeCode = `EMP-${String(nextNum).padStart(5, '0')}`;
          }

          const record = await tx.employee.create({
            data: {
              employeeCode,
              name: row.name,
              designationId: row.designationId,
              departmentId: row.departmentId,
              joiningDate: row.joiningDate ? new Date(row.joiningDate) : new Date(),
              resignationDate: row.resignationDate ? new Date(row.resignationDate) : null,
              baseSalary: safeFinancialRound(Number(row.baseSalary) || 0),
              employeeType: row.employeeType || 'Permanent',
              status: row.status || 'Active',
              companyId: companyId || null,
              gender: nullIfEmpty(row.gender),
              bloodGroup: nullIfEmpty(row.bloodGroup),
              religion: nullIfEmpty(row.religion),
              dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
              fatherName: nullIfEmpty(row.fatherName),
              motherName: nullIfEmpty(row.motherName),
              spouseName: nullIfEmpty(row.spouseName),
              maritalStatus: nullIfEmpty(row.maritalStatus),
              nidNumber: nullIfEmpty(row.nidNumber),
              tinNumber: nullIfEmpty(row.tinNumber),
              phone: nullIfEmpty(row.phone),
              email: nullIfEmpty(row.email),
              presentAddress: nullIfEmpty(row.presentAddress),
              permanentAddress: nullIfEmpty(row.permanentAddress),
              emergencyContact: nullIfEmpty(row.emergencyContact),
              emergencyContactName: nullIfEmpty(row.emergencyContactName),
              bankName: nullIfEmpty(row.bankName),
              bankAccountNo: nullIfEmpty(row.bankAccountNo),
              photo: nullIfEmpty(row.photo),
              nidFrontImage: nullIfEmpty(row.nidFrontImage),
              nidBackImage: nullIfEmpty(row.nidBackImage),
              referenceBy: nullIfEmpty(row.referenceBy),
              address: nullIfEmpty(row.address),
              isActive: row.isActive ?? true,
            },
            include: {
              designation: true,
              department: true,
              leaveAllocations: true,
              _count: { select: { leaves: true, srTargets: true, leaveAllocations: true } },
            },
          });
          created.push(record);
        }

        // Single activity log for batch
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'HR-Personnel-Core',
          recordId: 'BATCH',
          recordLabel: `Batch import: ${created.length} employee(s)`,
          userId: security.user?.id,
          userName: security.user?.name,
          details: JSON.stringify({ count: created.length, codes: created.map((r: any) => r.employeeCode) }),
        });

        return created;
      });
      return NextResponse.json(results, { status: 201 });
    }

    // ── Single mode ──
    const imgError = validateImageFields(body, ['photo', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Phone/email/NID format validation
    if (body.phone?.trim() && !isValidPhone(body.phone.trim())) {
      return NextResponse.json({ error: 'Invalid phone format. Use Bangladesh format (+880XXXXXXXXXX) or international format.' }, { status: 400 });
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
      // Unique Corporate Identifiers per tenant (single mode only)
      if (body.nidNumber?.trim() && companyId) {
        const nidCollision = await tx.employee.findFirst({
          where: { companyId, nidNumber: body.nidNumber.trim(), isActive: true }
        });
        if (nidCollision) {
          throw new Error('Corporate Entity Collision: NID already registered under this company.');
        }
      }
      if (body.phone?.trim() && companyId) {
        const phoneCollision = await tx.employee.findFirst({
          where: { companyId, phone: body.phone.trim(), isActive: true }
        });
        if (phoneCollision) {
          throw new Error('Corporate Entity Collision: Phone number already registered under this company.');
        }
      }
      if (body.email?.trim() && companyId) {
        const emailCollision = await tx.employee.findFirst({
          where: { companyId, email: body.email.trim().toLowerCase(), isActive: true }
        });
        if (emailCollision) {
          throw new Error('Corporate Entity Collision: Email already registered under this company.');
        }
      }

      // Auto-generate EMP-XXXXX code (5-digit zero-padded)
      let employeeCode = body.employeeCode;
      if (!employeeCode) {
        const allEmployees = await tx.employee.findMany({ select: { employeeCode: true } });
        let nextNum = 1;
        for (const e of allEmployees) {
          const match = e.employeeCode?.match(/EMP-(\d+)/);
          if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        employeeCode = `EMP-${String(nextNum).padStart(5, '0')}`;
      }

      const record = await tx.employee.create({
        data: {
          employeeCode,
          name: stripHtml(String(body.name || '')),
          designationId: body.designationId,
          departmentId: body.departmentId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : new Date(),
          resignationDate: body.resignationDate ? new Date(body.resignationDate) : null,
          baseSalary: safeFinancialRound(Number(body.baseSalary) || 0),
          employeeType: body.employeeType || 'Permanent',
          status: body.status || 'Active',
          companyId: companyId || null,
          gender: nullIfEmpty(body.gender),
          bloodGroup: nullIfEmpty(body.bloodGroup),
          religion: body.religion ? stripHtml(String(body.religion)) : null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          fatherName: body.fatherName ? stripHtml(String(body.fatherName)) : null,
          motherName: body.motherName ? stripHtml(String(body.motherName)) : null,
          spouseName: body.spouseName ? stripHtml(String(body.spouseName)) : null,
          maritalStatus: nullIfEmpty(body.maritalStatus),
          nidNumber: nullIfEmpty(body.nidNumber),
          tinNumber: nullIfEmpty(body.tinNumber),
          phone: nullIfEmpty(body.phone),
          email: body.email ? stripHtml(String(body.email)).toLowerCase() : null,
          presentAddress: body.presentAddress ? stripHtml(String(body.presentAddress)) : null,
          permanentAddress: body.permanentAddress ? stripHtml(String(body.permanentAddress)) : null,
          emergencyContact: nullIfEmpty(body.emergencyContact),
          emergencyContactName: body.emergencyContactName ? stripHtml(String(body.emergencyContactName)) : null,
          bankName: body.bankName ? stripHtml(String(body.bankName)) : null,
          bankAccountNo: nullIfEmpty(body.bankAccountNo),
          photo: nullIfEmpty(body.photo),
          nidFrontImage: nullIfEmpty(body.nidFrontImage),
          nidBackImage: nullIfEmpty(body.nidBackImage),
          referenceBy: body.referenceBy ? stripHtml(String(body.referenceBy)) : null,
          address: body.address ? stripHtml(String(body.address)) : null,
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
        action: 'CREATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.employeeCode} - ${record.name}`,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({ employeeCode: record.employeeCode, name: record.name, designationId: record.designationId, departmentId: record.departmentId }),
      });

      return record;
    });

    // Automated SMS: HR Lifecycle Event
    try {
      const { triggerHRLifecycleSms } = await import('@/lib/sms-event-hooks');
      await triggerHRLifecycleSms({
        id: item.id,
        name: item.name,
        phone: item.phone || undefined,
        eventType: 'Onboarding',
        details: `Welcome to the team! Your joining date is ${new Date(item.joiningDate).toLocaleDateString('en-GB')}`,
        companyId: item.companyId || undefined,
      });
    } catch (smsError) {
      console.error('[Employees] SMS trigger failed (non-blocking):', smsError);
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    if (error?.message?.includes('Corporate Entity Collision')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.message?.includes('minimum age') || error?.message?.includes('must be strictly after')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
  }
}
