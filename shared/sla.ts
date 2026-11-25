import type { Complaint, PriorityLevel, SlaState } from './types.ts';

export interface SlaWindowSpec {
  tier: 'Critical' | 'High' | 'Normal';
  hours: number;
  label: string;
}

export function getSlaWindowForPriority(priorityScore: number): SlaWindowSpec {
  if (priorityScore >= 80) {
    return { tier: 'Critical', hours: 48, label: '48 hours' };
  }
  if (priorityScore >= 60) {
    return { tier: 'High', hours: 7 * 24, label: '7 days' };
  }
  return { tier: 'Normal', hours: 15 * 24, label: '15 days' };
}

export function calculateSlaDeadline(createdAtIso: string, priorityScore: number): string {
  const createdMs = Number.isFinite(Date.parse(createdAtIso)) ? Date.parse(createdAtIso) : Date.now();
  const windowSpec = getSlaWindowForPriority(priorityScore);
  return new Date(createdMs + windowSpec.hours * 60 * 60 * 1000).toISOString();
}

export interface SlaEvaluation {
  state: SlaState;
  isBreached: boolean;
  isResolved: boolean;
  deadlineIso: string;
  windowLabel: string;
  windowHours: number;
  remainingMs: number;
  overdueMs: number;
  progressPercent: number;
  formattedDelta: string;
}

export function formatDurationCompact(ms: number): string {
  const absMs = Math.abs(ms);
  const totalMinutes = Math.max(0, Math.floor(absMs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

export function evaluateComplaintSla(
  complaint: Pick<
    Complaint,
    'created_at' | 'priority_score' | 'status' | 'sla_deadline' | 'escalation_notice_generated' | 'sla_breach_simulated'
  >,
  nowMs = Date.now()
): SlaEvaluation {
  const windowSpec = getSlaWindowForPriority(complaint.priority_score);
  const deadlineIso = complaint.sla_deadline || calculateSlaDeadline(complaint.created_at, complaint.priority_score);
  const createdMs = Number.isFinite(Date.parse(complaint.created_at)) ? Date.parse(complaint.created_at) : nowMs;
  const deadlineMs = Number.isFinite(Date.parse(deadlineIso))
    ? Date.parse(deadlineIso)
    : createdMs + windowSpec.hours * 3600 * 1000;

  const isClosed = complaint.status === 'Resolved' || complaint.status === 'Rejected';
  const rawRemaining = deadlineMs - nowMs;
  const effectiveRemaining = complaint.sla_breach_simulated && !isClosed ? Math.min(rawRemaining, -6 * 3600 * 1000) : rawRemaining;
  const isBreached = !isClosed && (complaint.sla_breach_simulated || effectiveRemaining <= 0);

  const totalSpan = Math.max(1, deadlineMs - createdMs);
  const elapsed = Math.max(0, nowMs - createdMs);
  const progressPercent = isClosed
    ? 100
    : isBreached
      ? 100
      : Math.min(99, Math.max(4, Math.round((elapsed / totalSpan) * 100)));

  let state: SlaState;
  if (isClosed) {
    state = 'resolved';
  } else if (complaint.escalation_notice_generated) {
    state = 'escalated';
  } else if (isBreached) {
    state = 'breached';
  } else if (effectiveRemaining <= totalSpan * 0.25 || effectiveRemaining <= 12 * 3600 * 1000) {
    state = 'approaching';
  } else {
    state = 'within_sla';
  }

  return {
    state,
    isBreached,
    isResolved: isClosed,
    deadlineIso,
    windowLabel: windowSpec.label,
    windowHours: windowSpec.hours,
    remainingMs: Math.max(0, effectiveRemaining),
    overdueMs: isBreached ? Math.abs(effectiveRemaining) : 0,
    progressPercent,
    formattedDelta: formatDurationCompact(effectiveRemaining),
  };
}

export interface TriageSimulatorFactor {
  key: 'severity' | 'safety' | 'duplicates' | 'citizens' | 'frequency' | 'age';
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface TriageSimulatorScenario {
  id: 'open_manhole_school' | 'faded_zebra_crossing';
  badge: string;
  title: string;
  location: string;
  district: string;
  category: string;
  citizenReport: string;
  totalScore: number;
  priorityLevel: PriorityLevel;
  slaWindow: string;
  recommendedDepartment: string;
  safetyFlag: boolean;
  factors: TriageSimulatorFactor[];
  explanation: string;
}

export const AI_TRIAGE_SIMULATOR_SCENARIOS: TriageSimulatorScenario[] = [
  {
    id: 'open_manhole_school',
    badge: 'Scenario A · Critical Safety',
    title: 'Open Manhole Near School + Heavy Rain',
    location: 'School Road, Vijayanagar 1st Stage, Mysuru',
    district: 'Mysuru',
    category: 'Drainage and sewage problems',
    citizenReport:
      'Missing concrete manhole cover directly outside Government Primary School gate with heavy monsoon runoff submerging the pit edge.',
    totalScore: 94,
    priorityLevel: 'Critical',
    slaWindow: '48 hours',
    recommendedDepartment: 'Stormwater Drainage & Sewerage Dept',
    safetyFlag: true,
    factors: [
      {
        key: 'severity',
        label: 'Severity & Structural Hazard',
        points: 30,
        maxPoints: 30,
        detail: 'Unprotected deep shaft in active monsoon runoff',
      },
      {
        key: 'safety',
        label: 'Public Safety & School Zone Risk',
        points: 25,
        maxPoints: 25,
        detail: 'Immediate fall risk for children & pedestrians',
      },
      {
        key: 'duplicates',
        label: 'Duplicate Cluster Confirmation',
        points: 13,
        maxPoints: 15,
        detail: '3 independent citizen reports within 400m',
      },
      {
        key: 'citizens',
        label: 'Affected Citizens Impact',
        points: 10,
        maxPoints: 10,
        detail: '450+ students, parents & daily commuters',
      },
      {
        key: 'frequency',
        label: 'Recurring Ward Frequency',
        points: 9,
        maxPoints: 10,
        detail: 'High recurring stormwater incidents in ward',
      },
      {
        key: 'age',
        label: 'Response Urgency Window',
        points: 7,
        maxPoints: 10,
        detail: 'Unresolved > 18h with active rain forecast',
      },
    ],
    explanation:
      'Hybrid AI detects life-safety hazard terms ("open manhole", "school gate", "heavy rain") and clusters 3 nearby citizen confirmations, assigning 94/100 Critical Priority with a strict 48-hour SLA.',
  },
  {
    id: 'faded_zebra_crossing',
    badge: 'Scenario B · Routine Maintenance',
    title: 'Faded Zebra Crossing Paint',
    location: '4th Cross Residential Lane, Jayanagar, Bengaluru',
    district: 'Bengaluru',
    category: 'Public infrastructure damage',
    citizenReport:
      'White thermoplastic pedestrian crossing stripes near the neighborhood park entrance have faded and need repainting during scheduled maintenance.',
    totalScore: 34,
    priorityLevel: 'Low',
    slaWindow: '15 days',
    recommendedDepartment: 'Public Assets & Civil Maintenance',
    safetyFlag: false,
    factors: [
      {
        key: 'severity',
        label: 'Severity & Structural Hazard',
        points: 10,
        maxPoints: 30,
        detail: 'Surface marking wear; no structural failure',
      },
      {
        key: 'safety',
        label: 'Public Safety & School Zone Risk',
        points: 8,
        maxPoints: 25,
        detail: 'Low-speed residential street with intact signals',
      },
      {
        key: 'duplicates',
        label: 'Duplicate Cluster Confirmation',
        points: 3,
        maxPoints: 15,
        detail: 'Single isolated citizen report',
      },
      {
        key: 'citizens',
        label: 'Affected Citizens Impact',
        points: 5,
        maxPoints: 10,
        detail: '~60 daily neighborhood walkers',
      },
      {
        key: 'frequency',
        label: 'Recurring Ward Frequency',
        points: 4,
        maxPoints: 10,
        detail: 'Low historical incident volume in sector',
      },
      {
        key: 'age',
        label: 'Response Urgency Window',
        points: 4,
        maxPoints: 10,
        detail: 'Newly submitted maintenance request',
      },
    ],
    explanation:
      'Hybrid AI classifies this as non-emergency cosmetic/marking maintenance with low immediate injury risk, queuing it at 34/100 Normal Priority (15-day SLA) so emergency crews stay focused on life-safety hazards.',
  },
];
