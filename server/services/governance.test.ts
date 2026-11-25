import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Complaint } from '../../shared/types.ts';
import { OFFICIAL_DEPARTMENTS } from '../../shared/types.ts';

// Point database at an isolated temporary SQLite file before importing DB modules
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicsense-gov-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'governance.db');
process.env.CIVICSENSE_PROTOTYPE_MODE = 'true';

const { getDb } = await import('../db/database.ts');
const { seedDatabaseIfEmpty } = await import('../db/seed.ts');
const {
  authenticateDemoAdmin,
  authenticateUnified,
  generateAdminInvite,
  getAdminBootstrapStatus,
  HttpAuthError,
  listAdminInvites,
  registerInitialAdmin,
  registerOfficial,
  revokeAdminInvite,
  updateOfficerStatus,
} = await import('./authService.ts');
const { buildTemplateEscalationLetter, LEGAL_ESCALATION_DISCLAIMER } = await import(
  './escalationService.ts'
);

test('Two-tier Government Admin Bootstrap, Single-Use Invites, Pending Approval & Escalation Letters', async (t) => {
  const db = getDb();
  seedDatabaseIfEmpty();

  t.after(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('Demo Admin login works in prototype mode without locking Phase A Super Admin bootstrap', () => {
    const before = getAdminBootstrapStatus();
    assert.equal(before.bootstrapAvailable, true);
    assert.equal(before.prototypeMode, true);

    const demo = authenticateDemoAdmin();
    assert.equal(demo.user.role, 'admin');
    assert.equal(demo.user.email, 'demo.admin@civicsense.local');

    // Bootstrap MUST remain open because demo admin does not count as a real official
    const afterDemo = getAdminBootstrapStatus();
    assert.equal(afterDemo.bootstrapAvailable, true);
  });

  let superAdminUser: Awaited<ReturnType<typeof registerInitialAdmin>>['user'];

  await t.test('Phase A Initial Super Admin bootstrap succeeds once and permanently locks afterwards', () => {
    const created = registerInitialAdmin({
      full_name: 'Dr. Kavitha Rao',
      email: 'kavitha.rao@example.com',
      employee_id: 'KAS-001',
      designation: 'Chief Civic Commissioner',
      password: 'StrongPassword#2026',
      confirmPassword: 'StrongPassword#2026',
      security_question: 'What was the name of your first school?',
      security_answer: 'National Public School',
    });

    superAdminUser = created.user;
    assert.equal(superAdminUser.role, 'super_admin');
    assert.equal(superAdminUser.department, 'Central Command');
    assert.equal(superAdminUser.account_status, 'active');

    const statusAfter = getAdminBootstrapStatus();
    assert.equal(statusAfter.bootstrapAvailable, false);

    assert.throws(
      () =>
        registerInitialAdmin({
          full_name: 'Second Admin Attempt',
          email: 'second.admin@example.com',
          employee_id: 'KAS-002',
          designation: 'Deputy Commissioner',
          password: 'StrongPassword#2026',
          confirmPassword: 'StrongPassword#2026',
          security_question: 'What was the name of your first school?',
          security_answer: 'Vidya Mandir',
        }),
      (err: unknown) => err instanceof HttpAuthError && err.status === 403
    );
  });

  await t.test('Phase B Single-Use 8-char Invite Code grants instant official access and cannot be reused', () => {
    const roadsDept = OFFICIAL_DEPARTMENTS[1];
    const waterDept = OFFICIAL_DEPARTMENTS[2];

    const invite = generateAdminInvite({
      department: roadsDept,
      expiresInDays: 7,
      actor: superAdminUser,
    });
    assert.equal(invite.code.length, 8);
    assert.equal(invite.status, 'active');

    const officialReg = registerOfficial({
      registration_method: 'invite',
      invite_code: invite.code,
      full_name: 'Ramesh Gowda',
      email: 'ramesh.roads@example.com',
      department: roadsDept,
      employee_id: 'PWD-104',
      designation: 'Executive Engineer',
      password: 'StrongPassword#2026',
      confirmPassword: 'StrongPassword#2026',
      security_question: 'What is your favorite Indian city?',
      security_answer: 'Mysuru',
    });

    assert.equal(officialReg.status, 'active');
    assert.equal(officialReg.user.role, 'admin');
    assert.equal(officialReg.user.department, roadsDept);
    assert.ok(officialReg.token);

    // Reusing the same invite code must fail
    assert.throws(
      () =>
        registerOfficial({
          registration_method: 'invite',
          invite_code: invite.code,
          full_name: 'Duplicate Reuse Attempt',
          email: 'reuse.attempt@example.com',
          department: roadsDept,
          employee_id: 'PWD-105',
          designation: 'Assistant Engineer',
          password: 'StrongPassword#2026',
          confirmPassword: 'StrongPassword#2026',
          security_question: 'What is your favorite Indian city?',
          security_answer: 'Hubballi',
        }),
      (err: unknown) => err instanceof HttpAuthError && err.status === 400
    );

    // Revoking an unused invite code prevents its redemption
    const invite2 = generateAdminInvite({
      department: waterDept,
      expiresInDays: 3,
      actor: superAdminUser,
    });
    revokeAdminInvite(invite2.id, superAdminUser);
    const updatedList = listAdminInvites();
    assert.equal(updatedList.find((i) => i.id === invite2.id)?.status, 'revoked');
  });

  await t.test('Phase B Official Registration without invite creates pending account until Super Admin approves', () => {
    const waterDept = OFFICIAL_DEPARTMENTS[2];

    const pendingReg = registerOfficial({
      registration_method: 'email',
      full_name: 'Suresh Kulkarni',
      email: 'suresh.water@example.com',
      department: waterDept,
      employee_id: 'BWSSB-212',
      designation: 'Assistant Executive Engineer',
      password: 'StrongPassword#2026',
      confirmPassword: 'StrongPassword#2026',
      security_question: 'What is your favorite Indian city?',
      security_answer: 'Belagavi',
    });

    assert.equal(pendingReg.status, 'pending');
    assert.equal(pendingReg.user.account_status, 'pending');
    assert.equal(pendingReg.token, undefined);

    // Login blocked while pending
    assert.throws(
      () => authenticateUnified('suresh.water@example.com', 'StrongPassword#2026', 'official'),
      (err: unknown) => err instanceof HttpAuthError && err.status === 403
    );

    // Super Admin approves official
    const approved = updateOfficerStatus(pendingReg.user.id, 'active', superAdminUser);
    assert.equal(approved.account_status, 'active');

    // Login succeeds after approval
    const session = authenticateUnified('suresh.water@example.com', 'StrongPassword#2026', 'official');
    assert.equal(session.user.email, 'suresh.water@example.com');
    assert.equal(session.user.role, 'admin');
  });

  await t.test('Multilingual escalation fallback templates generate English, Kannada, and Hindi notices with statutory citations and disclaimer', () => {
    const sampleComplaint: Complaint = {
      id: 99,
      user_id: 1,
      complaint_code: 'CS-2026-0099',
      title: 'Uncovered Storm Drain Near Primary School',
      description: 'Open drain has been flooded for 4 days causing severe hazard to children.',
      category: 'Drainage and sewage problems',
      predicted_category: 'Drainage and sewage problems',
      severity: 'Critical',
      district: 'Bengaluru Urban',
      locality: 'Indiranagar',
      location: '100 Feet Road, Indiranagar',
      latitude: 12.9716,
      longitude: 77.6412,
      image_path: null,
      incident_date: '2026-01-01',
      affected_citizens: 250,
      reporter_name: 'Ananya Deshpande',
      contact_info: 'ananya@example.com',
      priority_score: 94,
      priority_level: 'Critical',
      critical_safety_flag: true,
      ai_explanation: 'Critical safety hazard near school.',
      suggested_action: 'Dispatch emergency barricade and drain cover crew.',
      ai_keywords: ['open drain', 'school'],
      factor_breakdown: {
        severityPoints: 30,
        safetyRiskPoints: 25,
        duplicatePoints: 12,
        affectedCitizensPoints: 10,
        areaFrequencyPoints: 9,
        agePoints: 8,
      },
      ai_source: 'rules',
      status: 'In Progress',
      is_demo: false,
      original_language: 'en',
      english_title: null,
      english_description: null,
      english_location: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-05T00:00:00.000Z',
      sla_deadline: '2026-01-03T00:00:00.000Z',
      escalation_notice_generated: false,
      escalation_notice_sent_at: null,
      escalation_language: null,
      escalation_document: null,
      escalation_generation_method: null,
      sla_breach_simulated: false,
    };

    for (const lang of ['en', 'kn', 'hi'] as const) {
      const letter = buildTemplateEscalationLetter(sampleComplaint, [], lang);
      assert.ok(letter.includes('CS-2026-0099'), `Letter (${lang}) must reference ticket code`);
      assert.ok(
        letter.includes('RTI') || letter.includes('ಮಾಹಿತಿ ಹಕ್ಕು') || letter.includes('सूचना का अधिकार'),
        `Letter (${lang}) must cite RTI Act`
      );
      assert.ok(
        LEGAL_ESCALATION_DISCLAIMER[lang].length > 40,
        `Disclaimer (${lang}) must be non-empty`
      );
    }
  });
});
