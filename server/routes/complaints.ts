import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type {
  AnalyticsResponse,
  Complaint,
  ComplaintDetail,
  ComplaintStatus,
  DuplicateMatch,
  InfrastructureCategory,
  PriorityFactorBreakdown,
  SupportedLanguage,
} from '../../shared/types.ts';
import {
  COMPLAINT_STATUSES,
  INFRASTRUCTURE_CATEGORIES,
  KARNATAKA_DISTRICTS,
} from '../../shared/types.ts';
import {
  calculateHaversineKm,
  detectComplaintLanguage,
  fallbackTranslateToEnglish,
  generateAIInsights,
  isGeminiConfigured,
  localizeComplaintNarrative,
  normalizeTargetLanguage,
  runHybridComplaintAnalysis,
} from '../ai/engine.ts';
import { getDb, uploadsDir } from '../db/database.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    cb(null, `complaint-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

interface RawComplaintRow {
  id: number;
  complaint_code: string;
  user_id: number;
  reporter_name?: string;
  title: string;
  description: string;
  category: InfrastructureCategory;
  predicted_category: InfrastructureCategory;
  image_path: string | null;
  location: string;
  locality: string;
  district: string;
  latitude: number;
  longitude: number;
  incident_date: string;
  contact_info: string;
  affected_citizens: number;
  severity: Complaint['severity'];
  priority_score: number;
  priority_level: Complaint['priority_level'];
  ai_keywords: string;
  ai_explanation: string;
  suggested_action: string;
  factor_breakdown: string;
  critical_safety_flag: number;
  ai_source: 'rules' | 'hybrid-gemini';
  original_language?: SupportedLanguage;
  english_title?: string | null;
  english_description?: string | null;
  english_location?: string | null;
  status: ComplaintStatus;
  is_demo: number;
  created_at: string;
  updated_at: string;
  duplicate_count?: number;
  department?: string | null;
  assigned_to?: string | null;
}

function getRequestLanguage(req: { query?: Record<string, unknown>; body?: Record<string, unknown>; headers?: Record<string, unknown> }): SupportedLanguage {
  const qLang = req.query?.lang;
  if (typeof qLang === 'string' && qLang.trim()) {
    return normalizeTargetLanguage(qLang);
  }
  const bLang = req.body?.language;
  if (typeof bLang === 'string' && bLang.trim()) {
    return normalizeTargetLanguage(bLang);
  }
  const headerLang = req.headers?.['accept-language'];
  if (typeof headerLang === 'string' && headerLang.trim()) {
    return normalizeTargetLanguage(headerLang.split(',')[0]);
  }
  return 'en';
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hydrateComplaint(row: RawComplaintRow): Complaint {
  return {
    id: row.id,
    complaint_code: row.complaint_code,
    user_id: row.user_id,
    reporter_name: row.reporter_name ?? 'Citizen Reporter',
    title: row.title,
    description: row.description,
    category: row.category,
    predicted_category: row.predicted_category,
    image_path: row.image_path,
    location: row.location,
    locality: row.locality,
    district: row.district,
    latitude: row.latitude,
    longitude: row.longitude,
    incident_date: row.incident_date,
    contact_info: row.contact_info,
    affected_citizens: row.affected_citizens,
    severity: row.severity,
    priority_score: row.priority_score,
    priority_level: row.priority_level,
    ai_keywords: parseJsonSafe<string[]>(row.ai_keywords, []),
    ai_explanation: row.ai_explanation,
    suggested_action: row.suggested_action,
    factor_breakdown: parseJsonSafe<PriorityFactorBreakdown>(row.factor_breakdown, {
      severityPoints: 15,
      safetyRiskPoints: 10,
      duplicatePoints: 0,
      affectedCitizensPoints: 4,
      areaFrequencyPoints: 0,
      agePoints: 0,
    }),
    critical_safety_flag: Boolean(row.critical_safety_flag),
    ai_source: row.ai_source === 'hybrid-gemini' ? 'hybrid-gemini' : 'rules',
    original_language: normalizeTargetLanguage(
      row.original_language ?? detectComplaintLanguage(`${row.title} ${row.description}`)
    ),
    english_title: row.english_title ?? null,
    english_description: row.english_description ?? null,
    english_location: row.english_location ?? null,
    status: row.status,
    is_demo: Boolean(row.is_demo),
    created_at: row.created_at,
    updated_at: row.updated_at,
    duplicate_count: row.duplicate_count ?? 0,
    department: row.department ?? null,
    assigned_to: row.assigned_to ?? null,
  };
}

function saveBase64Image(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) return null;
  const ext = match[1].toLowerCase() === 'png' ? '.png' : match[1].toLowerCase() === 'webp' ? '.webp' : '.jpg';
  const filename = `complaint-sync-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  const fullPath = path.join(uploadsDir, filename);
  fs.writeFileSync(fullPath, Buffer.from(match[2], 'base64'));
  return `/uploads/${filename}`;
}

function buildFilteredQuery(queryParams: Record<string, unknown>) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const search = typeof queryParams.search === 'string' ? queryParams.search.trim() : '';
  const category = typeof queryParams.category === 'string' ? queryParams.category.trim() : '';
  const priority = typeof queryParams.priority === 'string' ? queryParams.priority.trim() : '';
  const district = typeof queryParams.district === 'string' ? queryParams.district.trim() : '';
  const status = typeof queryParams.status === 'string' ? queryParams.status.trim() : '';
  const dateFrom = typeof queryParams.dateFrom === 'string' ? queryParams.dateFrom.trim() : '';
  const dateTo = typeof queryParams.dateTo === 'string' ? queryParams.dateTo.trim() : '';

  if (search) {
    clauses.push('(c.complaint_code LIKE ? OR c.title LIKE ? OR c.description LIKE ? OR c.english_title LIKE ? OR c.english_description LIKE ? OR c.location LIKE ? OR c.locality LIKE ? OR c.district LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like, like);
  }
  if (category && category !== 'All') {
    clauses.push('c.category = ?');
    params.push(category);
  }
  if (priority && priority !== 'All') {
    clauses.push('c.priority_level = ?');
    params.push(priority);
  }
  if (district && district !== 'All') {
    clauses.push('c.district = ?');
    params.push(district);
  }
  if (status && status !== 'All') {
    clauses.push('c.status = ?');
    params.push(status);
  }
  if (dateFrom) {
    clauses.push('date(c.created_at) >= date(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('date(c.created_at) <= date(?)');
    params.push(dateTo);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { whereSql, params };
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as total FROM Complaints').get() as { total: number };
  res.json({
    status: 'ok',
    database: 'sqlite',
    complaintsCount: row.total,
    aiMode: isGeminiConfigured() ? 'hybrid-gemini' : 'rules',
  });
});

apiRouter.get('/complaints', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const { whereSql, params } = buildFilteredQuery(req.query as Record<string, unknown>);
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'priority';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    let finalWhere = whereSql;
    const finalParams = [...params];
    if (req.authUser?.role === 'CITIZEN') {
      finalWhere = finalWhere ? `${finalWhere} AND c.user_id = ?` : 'WHERE c.user_id = ?';
      finalParams.push(req.authUser.id);
    }

    let orderSql = `c.priority_score ${sortDir}, c.created_at DESC`;
    if (sortBy === 'date') {
      orderSql = `c.created_at ${sortDir}`;
    } else if (sortBy === 'severity') {
      orderSql = `CASE c.severity WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END ${sortDir}, c.priority_score DESC`;
    }

    const sql = `
      SELECT
        c.*,
        u.full_name AS reporter_name,
        da.department AS department,
        da.assigned_to AS assigned_to,
        (SELECT COUNT(*) FROM Complaint_Duplicates cd WHERE cd.complaint_id = c.id) AS duplicate_count
      FROM Complaints c
      LEFT JOIN Users u ON u.id = c.user_id
      LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
      ${finalWhere}
      ORDER BY ${orderSql}
    `;

    const rows = db.prepare(sql).all(...finalParams) as RawComplaintRow[];
    res.json({ complaints: rows.map(hydrateComplaint) });
  } catch (err) {
    console.error('Error listing complaints:', err);
    res.status(500).json({ error: 'Failed to retrieve complaints.' });
  }
});

apiRouter.get('/complaints/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const idParam = Number(req.params.id);
    if (!Number.isFinite(idParam)) {
      res.status(400).json({ error: 'Invalid complaint ID.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT c.*, u.full_name AS reporter_name, da.department AS department, da.assigned_to AS assigned_to,
         (SELECT COUNT(*) FROM Complaint_Duplicates cd WHERE cd.complaint_id = c.id) AS duplicate_count
         FROM Complaints c
         LEFT JOIN Users u ON u.id = c.user_id
         LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
         WHERE c.id = ?`
      )
      .get(idParam) as RawComplaintRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    if (req.authUser?.role === 'CITIZEN' && row.user_id !== req.authUser.id) {
      res.status(403).json({ error: 'Access denied. Citizens can only inspect their own complaints.' });
      return;
    }

    const complaint = hydrateComplaint(row);

    const duplicates = db
      .prepare(
        `SELECT cd.id, cd.complaint_id, cd.related_complaint_id, cd.similarity_score, cd.reason,
         c2.title AS related_title, c2.status AS related_status, c2.location AS related_location, c2.created_at AS related_created_at
         FROM Complaint_Duplicates cd
         JOIN Complaints c2 ON c2.id = cd.related_complaint_id
         WHERE cd.complaint_id = ?
         ORDER BY cd.similarity_score DESC`
      )
      .all(idParam) as DuplicateMatch[];

    const assignment = db
      .prepare('SELECT id, complaint_id, department, assigned_to, assigned_at FROM Department_Assignments WHERE complaint_id = ?')
      .get(idParam) as ComplaintDetail['assignment'];

    const updates = db
      .prepare('SELECT id, complaint_id, status, remarks, updated_by, updated_at FROM Complaint_Updates WHERE complaint_id = ? ORDER BY updated_at ASC, id ASC')
      .all(idParam) as ComplaintDetail['updates'];

    const allCoords = db.prepare('SELECT id, latitude, longitude, district, locality FROM Complaints').all() as Array<{
      id: number;
      latitude: number;
      longitude: number;
      district: string;
      locality: string;
    }>;

    const areaCount = allCoords.filter((other) => {
      const dist = calculateHaversineKm(complaint.latitude, complaint.longitude, other.latitude, other.longitude);
      return dist <= 3.0 || (other.district === complaint.district && other.locality === complaint.locality);
    }).length;

    const reqLang = getRequestLanguage(req);
    const originalLang = complaint.original_language ?? detectComplaintLanguage(`${complaint.title} ${complaint.description}`);
    const englishTitle =
      complaint.english_title ||
      (originalLang === 'en' ? complaint.title : fallbackTranslateToEnglish(complaint.title, originalLang, complaint.predicted_category));
    const englishDescription =
      complaint.english_description ||
      (originalLang === 'en' ? complaint.description : fallbackTranslateToEnglish(complaint.description, originalLang, complaint.predicted_category));
    const englishLocation =
      complaint.english_location ||
      (originalLang === 'en' ? complaint.location : fallbackTranslateToEnglish(complaint.location, originalLang));

    const localizedNarrative =
      reqLang !== 'en' || originalLang !== 'en'
        ? localizeComplaintNarrative(complaint, reqLang, duplicates.length, Math.max(0, areaCount - 1))
        : null;

    const detail: ComplaintDetail = {
      ...complaint,
      original_language: originalLang,
      english_title: englishTitle,
      english_description: englishDescription,
      english_location: englishLocation,
      ai_explanation:
        reqLang === originalLang && complaint.ai_explanation
          ? complaint.ai_explanation
          : localizedNarrative?.explanation ?? complaint.ai_explanation,
      suggested_action:
        reqLang === originalLang && complaint.suggested_action
          ? complaint.suggested_action
          : localizedNarrative?.suggestedAction ?? complaint.suggested_action,
      duplicates,
      assignment: assignment ?? null,
      updates,
      area_complaint_count: areaCount,
    };

    res.json({ complaint: detail });
  } catch (err) {
    console.error('Error reading complaint detail:', err);
    res.status(500).json({ error: 'Failed to load complaint details.' });
  }
});

apiRouter.post('/complaints/analyze-preview', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, location, category, district, locality, latitude, longitude, affectedCitizens } = req.body ?? {};
    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required for analysis.' });
      return;
    }

    const db = getDb();
    const existing = db
      .prepare('SELECT id, title, description, english_title, english_description, category, district, locality, latitude, longitude, status, location, created_at FROM Complaints')
      .all() as Array<{
      id: number;
      title: string;
      description: string;
      english_title?: string | null;
      english_description?: string | null;
      category: string;
      district: string;
      locality: string;
      latitude: number;
      longitude: number;
      status: string;
      location: string;
      created_at: string;
    }>;

    const preset = KARNATAKA_DISTRICTS.find((d) => d.name === district) ?? KARNATAKA_DISTRICTS[0];
    const analysis = await runHybridComplaintAnalysis({
      title: String(title),
      description: String(description),
      location: typeof location === 'string' ? location : undefined,
      selectedCategory: INFRASTRUCTURE_CATEGORIES.includes(category) ? category : undefined,
      district: String(district || preset.name),
      locality: String(locality || preset.defaultLocality),
      latitude: Number(latitude) || preset.latitude,
      longitude: Number(longitude) || preset.longitude,
      affectedCitizens: Number(affectedCitizens) || 40,
      targetLanguage: getRequestLanguage(req),
      existingComplaints: existing,
    });

    res.json({ analysis });
  } catch (err) {
    console.error('Analyze preview error:', err);
    res.status(500).json({ error: 'Failed to analyze complaint preview.' });
  }
});

apiRouter.post('/complaints', requireAuth, upload.single('image'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const description = String(body.description ?? '').trim();
    const categoryInput = String(body.category ?? '').trim() as InfrastructureCategory;
    const district = String(body.district ?? '').trim();
    const locality = String(body.locality ?? '').trim();
    const location = String(body.location ?? '').trim();
    const incidentDate = String(body.incident_date ?? new Date().toISOString().slice(0, 10)).trim();
    const contactInfo = String(body.contact_info ?? '').trim();
    const affectedCitizens = Math.max(1, Math.min(10000, Number(body.affected_citizens) || 35));

    if (title.length < 4 || description.length < 10) {
      res.status(400).json({ error: 'Please provide a descriptive title (min 4 chars) and detailed description (min 10 chars).' });
      return;
    }

    if (!district || !location) {
      res.status(400).json({ error: 'District and street location are required.' });
      return;
    }

    const preset = KARNATAKA_DISTRICTS.find((d) => d.name.toLowerCase() === district.toLowerCase()) ?? KARNATAKA_DISTRICTS[0];
    const latitude = Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : preset.latitude;
    const longitude = Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : preset.longitude;

    let imagePath: string | null = null;
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    } else if (typeof body.imageDataUrl === 'string' && body.imageDataUrl.startsWith('data:image/')) {
      imagePath = saveBase64Image(body.imageDataUrl);
    }

    const db = getDb();
    const existing = db
      .prepare('SELECT id, title, description, english_title, english_description, category, district, locality, latitude, longitude, status, location, created_at FROM Complaints')
      .all() as Array<{
      id: number;
      title: string;
      description: string;
      english_title?: string | null;
      english_description?: string | null;
      category: string;
      district: string;
      locality: string;
      latitude: number;
      longitude: number;
      status: string;
      location: string;
      created_at: string;
    }>;

    const selectedCategory = INFRASTRUCTURE_CATEGORIES.includes(categoryInput) ? categoryInput : undefined;
    const analysis = await runHybridComplaintAnalysis({
      title,
      description,
      location,
      selectedCategory,
      district: preset.name,
      locality: locality || preset.defaultLocality,
      latitude,
      longitude,
      affectedCitizens,
      imagePath,
      targetLanguage: getRequestLanguage(req),
      existingComplaints: existing,
    });

    const finalCategory = selectedCategory ?? analysis.predictedCategory;
    const submittingUserId = req.authUser?.id ?? 1;
    const submittingUserName = req.authUser?.full_name ?? 'Citizen Reporter';

    const originalLanguage = analysis.detectedLanguage ?? detectComplaintLanguage(`${title} ${description} ${location}`);
    const englishTitle = analysis.englishTranslation?.title ?? title;
    const englishDescription = analysis.englishTranslation?.description ?? description;
    const englishLocation = analysis.englishTranslation?.location ?? location;

    const nowIso = new Date().toISOString();
    const countRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM Complaints').get() as { maxId: number };
    const nextNum = 202601 + countRow.maxId;
    const complaintCode = `CS-${nextNum}`;

    const insertResult = db
      .prepare(
        `INSERT INTO Complaints (
          complaint_code, user_id, title, description, category, predicted_category,
          image_path, location, locality, district, latitude, longitude,
          incident_date, contact_info, affected_citizens, severity, priority_score,
          priority_level, ai_keywords, ai_explanation, suggested_action,
          factor_breakdown, critical_safety_flag, ai_source,
          original_language, english_title, english_description, english_location,
          status, is_demo, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          'Submitted', 0, ?, ?
        )`
      )
      .run(
        complaintCode,
        submittingUserId,
        title,
        description,
        finalCategory,
        analysis.predictedCategory,
        imagePath,
        location,
        locality || preset.defaultLocality,
        preset.name,
        latitude,
        longitude,
        incidentDate,
        contactInfo || req.authUser?.email || 'Citizen Portal Submission',
        affectedCitizens,
        analysis.estimatedSeverity,
        analysis.priorityScore,
        analysis.priorityLevel,
        JSON.stringify(analysis.detectedKeywords),
        analysis.explanation,
        analysis.suggestedAction,
        JSON.stringify(analysis.factorBreakdown),
        analysis.criticalSafetyFlag ? 1 : 0,
        analysis.aiSource,
        originalLanguage,
        englishTitle,
        englishDescription,
        englishLocation,
        nowIso,
        nowIso
      );

    const newId = Number(insertResult.lastInsertRowid);

    const insertDup = db.prepare(
      'INSERT OR IGNORE INTO Complaint_Duplicates (complaint_id, related_complaint_id, similarity_score, reason) VALUES (?, ?, ?, ?)'
    );
    for (const dup of analysis.duplicates) {
      insertDup.run(newId, dup.related_complaint_id, dup.similarity_score, dup.reason ?? 'Geo-text similarity');
      insertDup.run(dup.related_complaint_id, newId, dup.similarity_score, dup.reason ?? 'Geo-text similarity');
    }

    db.prepare('INSERT INTO Complaint_Updates (complaint_id, status, remarks, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      newId,
      'Submitted',
      `Complaint registered and prioritized at ${analysis.priorityScore}/100 (${analysis.priorityLevel}).`,
      submittingUserName,
      nowIso
    );

    const createdRow = db
      .prepare(
        `SELECT c.*, u.full_name AS reporter_name, da.department AS department, da.assigned_to AS assigned_to,
         (SELECT COUNT(*) FROM Complaint_Duplicates cd WHERE cd.complaint_id = c.id) AS duplicate_count
         FROM Complaints c
         LEFT JOIN Users u ON u.id = c.user_id
         LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
         WHERE c.id = ?`
      )
      .get(newId) as RawComplaintRow;

    res.status(201).json({
      complaint: hydrateComplaint(createdRow),
      aiAnalysis: analysis,
    });
  } catch (err) {
    console.error('Error submitting complaint:', err);
    res.status(500).json({ error: 'Failed to submit complaint.' });
  }
});

apiRouter.patch('/complaints/:id', requireAuth, requireRole('ADMIN'), (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid complaint ID.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM Complaints WHERE id = ?').get(id) as RawComplaintRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const { status, department, assigned_to, remarks } = req.body ?? {};
    const nextStatus: ComplaintStatus = COMPLAINT_STATUSES.includes(status) ? status : existing.status;
    const nowIso = new Date().toISOString();

    db.prepare('UPDATE Complaints SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, nowIso, id);

    if (department && assigned_to) {
      db.prepare(
        `INSERT INTO Department_Assignments (complaint_id, department, assigned_to, assigned_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(complaint_id) DO UPDATE SET department = excluded.department, assigned_to = excluded.assigned_to, assigned_at = excluded.assigned_at`
      ).run(id, String(department).trim(), String(assigned_to).trim(), nowIso);
    }

    const remarkText =
      typeof remarks === 'string' && remarks.trim()
        ? remarks.trim()
        : department && assigned_to
          ? `Assigned to ${department} (${assigned_to}); status set to ${nextStatus}.`
          : `Status updated to ${nextStatus}.`;

    db.prepare('INSERT INTO Complaint_Updates (complaint_id, status, remarks, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      nextStatus,
      remarkText,
      `${req.authUser?.full_name ?? 'Administrator'} (Admin)`,
      nowIso
    );

    const updatedRow = db
      .prepare(
        `SELECT c.*, u.full_name AS reporter_name, da.department AS department, da.assigned_to AS assigned_to,
         (SELECT COUNT(*) FROM Complaint_Duplicates cd WHERE cd.complaint_id = c.id) AS duplicate_count
         FROM Complaints c
         LEFT JOIN Users u ON u.id = c.user_id
         LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
         WHERE c.id = ?`
      )
      .get(id) as RawComplaintRow;

    res.json({ complaint: hydrateComplaint(updatedRow) });
  } catch (err) {
    console.error('Error updating complaint:', err);
    res.status(500).json({ error: 'Failed to update complaint.' });
  }
});

apiRouter.get('/analytics', requireAuth, requireRole('ADMIN'), (req, res) => {
  try {
    const db = getDb();
    const { whereSql, params } = buildFilteredQuery(req.query as Record<string, unknown>);

    const rows = db
      .prepare(
        `SELECT c.*, u.full_name AS reporter_name, da.department AS department, da.assigned_to AS assigned_to
         FROM Complaints c
         LEFT JOIN Users u ON u.id = c.user_id
         LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
         ${whereSql}
         ORDER BY c.created_at ASC`
      )
      .all(...params) as RawComplaintRow[];

    const complaints = rows.map(hydrateComplaint);

    const resolvedItems = complaints.filter((c) => c.status === 'Resolved');
    const avgResolutionHours = resolvedItems.length
      ? Math.round(
          resolvedItems.reduce((sum, c) => {
            const hrs = Math.max(4, (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60));
            return sum + hrs;
          }, 0) / resolvedItems.length
        )
      : 0;

    const kpis = {
      total: complaints.length,
      newComplaints: complaints.filter((c) => c.status === 'Submitted').length,
      critical: complaints.filter((c) => c.priority_level === 'Critical').length,
      highPriority: complaints.filter((c) => c.priority_level === 'High').length,
      inProgress: complaints.filter((c) => c.status === 'In Progress' || c.status === 'Assigned').length,
      resolved: resolvedItems.length,
      pending: complaints.filter((c) => c.status !== 'Resolved' && c.status !== 'Rejected').length,
      underReview: complaints.filter((c) => c.status === 'Under Review').length,
      avgResolutionHours,
      resolutionRate: complaints.length ? Math.round((resolvedItems.length / complaints.length) * 100) : 0,
    };

    const byCategory = INFRASTRUCTURE_CATEGORIES.map((category) => {
      const items = complaints.filter((c) => c.category === category);
      return {
        category,
        count: items.length,
        criticalCount: items.filter((c) => c.priority_level === 'Critical').length,
        resolvedCount: items.filter((c) => c.status === 'Resolved').length,
      };
    });

    const districtNames = Array.from(new Set([...KARNATAKA_DISTRICTS.map((d) => d.name), ...complaints.map((c) => c.district)]));
    const byDistrict = districtNames
      .map((district) => {
        const items = complaints.filter((c) => c.district === district);
        return {
          district,
          count: items.length,
          criticalCount: items.filter((c) => c.priority_level === 'Critical').length,
          resolvedCount: items.filter((c) => c.status === 'Resolved').length,
          avgPriority: items.length ? Math.round(items.reduce((s, c) => s + c.priority_score, 0) / items.length) : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    const priorityLevels: Array<Complaint['priority_level']> = ['Critical', 'High', 'Medium', 'Low'];
    const byPriority = priorityLevels.map((level) => ({
      level,
      count: complaints.filter((c) => c.priority_level === level).length,
    }));

    const byStatus = COMPLAINT_STATUSES.map((status) => ({
      status,
      count: complaints.filter((c) => c.status === status).length,
    }));

    // Group by Month-Week or Month (YYYY-MM)
    const monthBuckets = new Map<string, { submitted: number; resolved: number; critical: number }>();
    for (const c of complaints) {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = monthBuckets.get(key) ?? { submitted: 0, resolved: 0, critical: 0 };
      bucket.submitted += 1;
      if (c.status === 'Resolved') bucket.resolved += 1;
      if (c.priority_level === 'Critical') bucket.critical += 1;
      monthBuckets.set(key, bucket);
    }

    const monthlyTrends = Array.from(monthBuckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, vals]) => {
        const [y, m] = ym.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { month: label, ...vals };
      });

    // Frequent problems by locality + category
    const freqMap = new Map<string, Complaint[]>();
    for (const c of complaints) {
      const key = `${c.locality} (${c.district})::${c.category}`;
      const arr = freqMap.get(key) ?? [];
      arr.push(c);
      freqMap.set(key, arr);
    }

    const frequentProblems = Array.from(freqMap.entries())
      .map(([key, items]) => {
        const [locPart, category] = key.split('::');
        return {
          label: `${category} — ${locPart}`,
          district: items[0]?.district ?? '',
          category,
          count: items.length,
          avgPriority: Math.round(items.reduce((s, i) => s + i.priority_score, 0) / items.length),
        };
      })
      .sort((a, b) => b.count - a.count || b.avgPriority - a.avgPriority)
      .slice(0, 8);

    // Hotspot clusters
    const hotspotMap = new Map<string, Complaint[]>();
    for (const c of complaints.filter((item) => item.status !== 'Resolved' && item.status !== 'Rejected')) {
      const key = `${c.district}::${c.locality}`;
      const arr = hotspotMap.get(key) ?? [];
      arr.push(c);
      hotspotMap.set(key, arr);
    }

    const hotspots = Array.from(hotspotMap.entries())
      .map(([key, items]) => {
        const [district, locality] = key.split('::');
        const lat = items.reduce((s, i) => s + i.latitude, 0) / items.length;
        const lng = items.reduce((s, i) => s + i.longitude, 0) / items.length;
        const catCounts = new Map<string, number>();
        for (const i of items) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1);
        const topCategory = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? items[0].category;
        return {
          district,
          locality,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lng.toFixed(5)),
          count: items.length,
          criticalCount: items.filter((i) => i.priority_level === 'Critical').length,
          maxPriority: Math.max(...items.map((i) => i.priority_score)),
          topCategory,
        };
      })
      .sort((a, b) => b.count - a.count || b.maxPriority - a.maxPriority);

    const payload: AnalyticsResponse = {
      kpis,
      byCategory,
      byDistrict,
      byPriority,
      byStatus,
      monthlyTrends,
      frequentProblems,
      hotspots,
    };

    res.json(payload);
  } catch (err) {
    console.error('Error building analytics:', err);
    res.status(500).json({ error: 'Failed to compute analytics.' });
  }
});

apiRouter.get('/insights', requireAuth, requireRole('ADMIN'), (req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.*, u.full_name AS reporter_name, da.department AS department, da.assigned_to AS assigned_to
         FROM Complaints c
         LEFT JOIN Users u ON u.id = c.user_id
         LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
         ORDER BY c.priority_score DESC`
      )
      .all() as RawComplaintRow[];

    const complaints = rows.map(hydrateComplaint);
    const duplicateRows = db
      .prepare('SELECT complaint_id, related_complaint_id, similarity_score FROM Complaint_Duplicates')
      .all() as Array<{ complaint_id: number; related_complaint_id: number; similarity_score: number }>;

    res.json(generateAIInsights(complaints, duplicateRows, getRequestLanguage(req)));
  } catch (err) {
    console.error('Error generating AI insights:', err);
    res.status(500).json({ error: 'Failed to generate AI insights.' });
  }
});

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

apiRouter.get('/export/csv', requireAuth, requireRole('ADMIN'), (req, res) => {
  try {
    const db = getDb();
    const { whereSql, params } = buildFilteredQuery(req.query as Record<string, unknown>);
    const rows = db
      .prepare(
        `SELECT c.*, da.department, da.assigned_to
         FROM Complaints c
         LEFT JOIN Department_Assignments da ON da.complaint_id = c.id
         ${whereSql}
         ORDER BY c.priority_score DESC, c.created_at DESC`
      )
      .all(...params) as RawComplaintRow[];

    const headers = [
      'Complaint ID',
      'Title',
      'Category',
      'Predicted Category',
      'District',
      'Locality',
      'Location',
      'Latitude',
      'Longitude',
      'Severity',
      'Priority Score',
      'Priority Level',
      'Status',
      'Department',
      'Assigned Officer',
      'Affected Citizens',
      'Incident Date',
      'Submitted At',
      'Demo Record',
    ];

    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.complaint_code,
          r.title,
          r.category,
          r.predicted_category,
          r.district,
          r.locality,
          r.location,
          r.latitude,
          r.longitude,
          r.severity,
          r.priority_score,
          r.priority_level,
          r.status,
          r.department ?? 'Unassigned',
          r.assigned_to ?? 'Unassigned',
          r.affected_citizens,
          r.incident_date,
          r.created_at,
          r.is_demo ? 'Yes' : 'No',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="civicsense-complaints-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export CSV.' });
  }
});
