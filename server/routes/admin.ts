import { Router } from 'express';
import { isGeminiConfigured } from '../ai/engine.ts';
import { getDb } from '../db/database.ts';
import { requireAuth, requireRole, setNoStoreHeaders, type AuthenticatedRequest } from '../middleware/auth.ts';
import { listAuditLogs } from '../services/auditService.ts';
import {
  generateAdminInvite,
  getAllowedAdminDomains,
  HttpAuthError,
  isPrototypeMode,
  listAdminInvites,
  listOfficers,
  revokeAdminInvite,
  updateOfficerStatus,
} from '../services/authService.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get('/invites', requireRole('admin', 'super_admin'), (_req, res) => {
  setNoStoreHeaders(res);
  res.json({ invites: listAdminInvites() });
});

adminRouter.post('/invites', requireRole('super_admin'), (req: AuthenticatedRequest, res) => {
  setNoStoreHeaders(res);
  try {
    const { department, expiresInDays } = req.body ?? {};
    const invite = generateAdminInvite({
      department: String(department ?? ''),
      expiresInDays: Number(expiresInDays) || 7,
      actor: req.authUser!,
    });
    res.status(201).json({ invite });
  } catch (err) {
    if (err instanceof HttpAuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to generate invite code.' });
  }
});

adminRouter.delete('/invites/:id', requireRole('super_admin'), (req: AuthenticatedRequest, res) => {
  setNoStoreHeaders(res);
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid invite ID.' });
      return;
    }
    revokeAdminInvite(id, req.authUser!);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof HttpAuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to revoke invite code.' });
  }
});

adminRouter.get('/officers', requireRole('admin', 'super_admin'), (_req, res) => {
  setNoStoreHeaders(res);
  res.json({ officers: listOfficers() });
});

adminRouter.patch('/officers/:id', requireRole('super_admin'), (req: AuthenticatedRequest, res) => {
  setNoStoreHeaders(res);
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid official ID.' });
      return;
    }
    const { account_status } = req.body ?? {};
    const officer = updateOfficerStatus(id, account_status, req.authUser!);
    res.json({ officer });
  } catch (err) {
    if (err instanceof HttpAuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update official status.' });
  }
});

adminRouter.get('/audit-logs', requireRole('admin', 'super_admin'), (req, res) => {
  setNoStoreHeaders(res);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const limit = Number(req.query.limit) || 120;
  res.json({ logs: listAuditLogs({ search, action, limit }) });
});

adminRouter.get('/settings', requireRole('admin', 'super_admin'), (_req, res) => {
  setNoStoreHeaders(res);
  const db = getDb();
  const totalComplaints = (db.prepare('SELECT COUNT(*) as c FROM Complaints').get() as { c: number }).c;
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM Users').get() as { c: number }).c;
  const activeInvites = listAdminInvites().filter((i) => i.status === 'active').length;

  res.json({
    prototypeMode: isPrototypeMode(),
    aiMode: isGeminiConfigured() ? 'hybrid-gemini' : 'rules',
    allowedAdminDomains: getAllowedAdminDomains(),
    slaPolicy: {
      critical: { minScore: 80, maxScore: 100, windowHours: 48, label: '48 hours' },
      high: { minScore: 60, maxScore: 79, windowHours: 168, label: '7 days' },
      normal: { minScore: 0, maxScore: 59, windowHours: 360, label: '15 days' },
    },
    counts: {
      totalComplaints,
      totalUsers,
      activeInvites,
    },
  });
});
