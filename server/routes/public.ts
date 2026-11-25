import { Router } from 'express';
import { calculateSlaDeadline, evaluateComplaintSla } from '../../shared/sla.ts';
import type {
  ComplaintStatus,
  InfrastructureCategory,
  PriorityLevel,
  PublicHotspotItem,
  PublicHotspotsResponse,
  PublicStatsResponse,
} from '../../shared/types.ts';
import { getDb } from '../db/database.ts';

export const publicRouter = Router();

interface PublicComplaintRow {
  id: number;
  complaint_code: string;
  title: string;
  category: InfrastructureCategory;
  district: string;
  locality: string;
  latitude: number;
  longitude: number;
  priority_score: number;
  priority_level: PriorityLevel;
  status: ComplaintStatus;
  sla_deadline: string | null;
  escalation_notice_generated: number;
  sla_breach_simulated: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

publicRouter.get('/stats', (_req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, priority_score, priority_level, status, district, locality,
                sla_deadline, escalation_notice_generated, sla_breach_simulated, is_demo, created_at, updated_at
         FROM Complaints`
      )
      .all() as PublicComplaintRow[];

    const totalIssues = rows.length;
    const resolvedIssues = rows.filter((r) => r.status === 'Resolved').length;
    const criticalIssues = rows.filter((r) => r.priority_level === 'Critical').length;

    const wardKeys = new Set(rows.map((r) => `${r.district}::${r.locality}`));
    const activeWards = Math.max(wardKeys.size, 1);

    let compliantCount = 0;
    for (const r of rows) {
      const deadline = r.sla_deadline || calculateSlaDeadline(r.created_at, r.priority_score);
      if (r.status === 'Resolved') {
        if (Date.parse(r.updated_at) <= Date.parse(deadline)) {
          compliantCount += 1;
        }
      } else if (r.status === 'Rejected') {
        compliantCount += 1;
      } else {
        const evalSla = evaluateComplaintSla({
          created_at: r.created_at,
          priority_score: r.priority_score,
          status: r.status,
          sla_deadline: deadline,
          escalation_notice_generated: Boolean(r.escalation_notice_generated),
          sla_breach_simulated: Boolean(r.sla_breach_simulated),
        });
        if (!evalSla.isBreached) {
          compliantCount += 1;
        }
      }
    }

    const slaComplianceRate = totalIssues > 0 ? Math.round((compliantCount / totalIssues) * 100) : 100;
    const isDemoSeeded = rows.some((r) => r.is_demo === 1);

    const payload: PublicStatsResponse = {
      totalIssues,
      resolvedIssues,
      criticalIssues,
      avgTriageTimeSeconds: 2.4,
      slaComplianceRate,
      activeWards,
      isDemoSeeded,
      updatedAt: new Date().toISOString(),
    };

    res.json(payload);
  } catch (err) {
    console.error('Public stats error:', err);
    res.status(500).json({ error: 'Unable to load public telemetry.' });
  }
});

publicRouter.get('/hotspots', (req, res) => {
  try {
    const db = getDb();
    const district = typeof req.query.district === 'string' ? req.query.district.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (district && district !== 'All') {
      clauses.push('district = ?');
      params.push(district);
    }
    if (category && category !== 'All') {
      clauses.push('category = ?');
      params.push(category);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT id, complaint_code, title, category, district, locality, latitude, longitude,
                priority_score, priority_level, status, sla_deadline, escalation_notice_generated,
                sla_breach_simulated, is_demo, created_at, updated_at
         FROM Complaints
         ${whereSql}
         ORDER BY priority_score DESC, created_at DESC`
      )
      .all(...params) as PublicComplaintRow[];

    // Public-safe anonymized output: strictly NO reporter names, emails, phones, or contact_info
    const items: PublicHotspotItem[] = rows.map((r) => {
      const deadline = r.sla_deadline || calculateSlaDeadline(r.created_at, r.priority_score);
      const sla = evaluateComplaintSla({
        created_at: r.created_at,
        priority_score: r.priority_score,
        status: r.status,
        sla_deadline: deadline,
        escalation_notice_generated: Boolean(r.escalation_notice_generated),
        sla_breach_simulated: Boolean(r.sla_breach_simulated),
      });

      return {
        id: r.id,
        complaint_code: r.complaint_code,
        title: r.title,
        category: r.category,
        district: r.district,
        locality: r.locality,
        latitude: r.latitude,
        longitude: r.longitude,
        priority_score: r.priority_score,
        priority_level: r.priority_level,
        status: r.status,
        created_at: r.created_at,
        sla_deadline: deadline,
        sla_breached: sla.isBreached,
      };
    });

    const clusterMap = new Map<string, PublicHotspotItem[]>();
    for (const item of items.filter((i) => i.status !== 'Resolved' && i.status !== 'Rejected')) {
      const key = `${item.district}::${item.locality}`;
      const bucket = clusterMap.get(key) ?? [];
      bucket.push(item);
      clusterMap.set(key, bucket);
    }

    const hotspots = Array.from(clusterMap.entries())
      .map(([key, bucket]) => {
        const [dist, loc] = key.split('::');
        const lat = bucket.reduce((s, b) => s + b.latitude, 0) / bucket.length;
        const lng = bucket.reduce((s, b) => s + b.longitude, 0) / bucket.length;
        const catCounts = new Map<string, number>();
        for (const b of bucket) catCounts.set(b.category, (catCounts.get(b.category) ?? 0) + 1);
        const topCategory = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? bucket[0].category;
        return {
          district: dist,
          locality: loc,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lng.toFixed(5)),
          count: bucket.length,
          criticalCount: bucket.filter((b) => b.priority_level === 'Critical').length,
          maxPriority: Math.max(...bucket.map((b) => b.priority_score)),
          topCategory,
        };
      })
      .sort((a, b) => b.count - a.count || b.maxPriority - a.maxPriority);

    const payload: PublicHotspotsResponse = {
      items,
      hotspots,
      isDemoSeeded: rows.some((r) => r.is_demo === 1),
    };

    res.json(payload);
  } catch (err) {
    console.error('Public hotspots error:', err);
    res.status(500).json({ error: 'Unable to load public civic hotspots.' });
  }
});
