import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_TRIAGE_SIMULATOR_SCENARIOS,
  calculateSlaDeadline,
  evaluateComplaintSla,
  getSlaWindowForPriority,
} from './sla.ts';

test('SLA window mapping obeys 48h Critical, 7d High, 15d Normal tiers', () => {
  assert.equal(getSlaWindowForPriority(95).hours, 48);
  assert.equal(getSlaWindowForPriority(80).hours, 48);
  assert.equal(getSlaWindowForPriority(79).hours, 168);
  assert.equal(getSlaWindowForPriority(60).hours, 168);
  assert.equal(getSlaWindowForPriority(59).hours, 360);
  assert.equal(getSlaWindowForPriority(20).hours, 360);
});

test('calculateSlaDeadline adds exact SLA window hours to createdAt', () => {
  const created = '2026-01-01T00:00:00.000Z';
  assert.equal(calculateSlaDeadline(created, 90), '2026-01-03T00:00:00.000Z');
  assert.equal(calculateSlaDeadline(created, 70), '2026-01-08T00:00:00.000Z');
  assert.equal(calculateSlaDeadline(created, 35), '2026-01-16T00:00:00.000Z');
});

test('evaluateComplaintSla transitions cleanly across within_sla, approaching, breached, escalated, and resolved', () => {
  const created = '2026-01-01T00:00:00.000Z';
  const deadline = calculateSlaDeadline(created, 90); // 2026-01-03T00:00:00.000Z (48h)

  const within = evaluateComplaintSla(
    {
      created_at: created,
      priority_score: 90,
      status: 'In Progress',
      sla_deadline: deadline,
      escalation_notice_generated: false,
      sla_breach_simulated: false,
    },
    Date.parse('2026-01-01T12:00:00.000Z')
  );
  assert.equal(within.state, 'within_sla');
  assert.equal(within.isBreached, false);

  const approaching = evaluateComplaintSla(
    {
      created_at: created,
      priority_score: 90,
      status: 'In Progress',
      sla_deadline: deadline,
      escalation_notice_generated: false,
      sla_breach_simulated: false,
    },
    Date.parse('2026-01-02T18:00:00.000Z') // 6h left out of 48h (<25%)
  );
  assert.equal(approaching.state, 'approaching');
  assert.equal(approaching.isBreached, false);

  const breached = evaluateComplaintSla(
    {
      created_at: created,
      priority_score: 90,
      status: 'In Progress',
      sla_deadline: deadline,
      escalation_notice_generated: false,
      sla_breach_simulated: false,
    },
    Date.parse('2026-01-03T05:00:00.000Z')
  );
  assert.equal(breached.state, 'breached');
  assert.equal(breached.isBreached, true);

  const escalated = evaluateComplaintSla(
    {
      created_at: created,
      priority_score: 90,
      status: 'In Progress',
      sla_deadline: deadline,
      escalation_notice_generated: true,
      sla_breach_simulated: false,
    },
    Date.parse('2026-01-03T05:00:00.000Z')
  );
  assert.equal(escalated.state, 'escalated');
  assert.equal(escalated.isBreached, true);

  const resolved = evaluateComplaintSla(
    {
      created_at: created,
      priority_score: 90,
      status: 'Resolved',
      sla_deadline: deadline,
      escalation_notice_generated: false,
      sla_breach_simulated: false,
    },
    Date.parse('2026-01-05T00:00:00.000Z')
  );
  assert.equal(resolved.state, 'resolved');
  assert.equal(resolved.isBreached, false);
});

test('AI Triage Simulator exposes calibrated Scenario A (Critical) and Scenario B (Low)', () => {
  assert.equal(AI_TRIAGE_SIMULATOR_SCENARIOS.length, 2);
  const critical = AI_TRIAGE_SIMULATOR_SCENARIOS.find((s) => s.id === 'open_manhole_school');
  const routine = AI_TRIAGE_SIMULATOR_SCENARIOS.find((s) => s.id === 'faded_zebra_crossing');
  assert.ok(critical && critical.totalScore >= 80 && critical.slaWindow === '48 hours');
  assert.ok(routine && routine.totalScore < 60 && routine.slaWindow === '15 days');
});
