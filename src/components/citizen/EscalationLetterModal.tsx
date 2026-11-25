import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Languages,
  Loader2,
  Scale,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generateEscalationLetterApi, markEscalationSentApi } from '../../lib/api.ts';
import { downloadEscalationPdf } from '../../lib/escalationPdf.ts';
import { formatLocaleDateTime } from '../../lib/i18nHelpers.ts';
import type { Complaint, SupportedLanguage } from '../../types/index.ts';

interface EscalationLetterModalProps {
  complaint: Complaint | null;
  onClose: () => void;
  onComplaintUpdated: (updated: Complaint) => void;
}

const LANG_OPTIONS: Array<{ code: SupportedLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'hi', label: 'हिन्दी' },
];

export const EscalationLetterModal: React.FC<EscalationLetterModalProps> = ({
  complaint,
  onClose,
  onComplaintUpdated,
}) => {
  const { t, i18n } = useTranslation();
  const initialLang: SupportedLanguage =
    complaint?.escalation_language ??
    (i18n.language === 'kn' || i18n.language === 'hi' ? i18n.language : 'en');

  const [language, setLanguage] = useState<SupportedLanguage>(initialLang);
  const [letterText, setLetterText] = useState<string>('');
  const [generationMethod, setGenerationMethod] = useState<'gemini' | 'template'>('template');
  const [disclaimer, setDisclaimer] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const loadOrGenerateLetter = async (targetComplaint: Complaint, targetLang: SupportedLanguage, forceRegenerate = false) => {
    setError(null);
    if (
      !forceRegenerate &&
      targetComplaint.escalation_notice_generated &&
      targetComplaint.escalation_document &&
      targetComplaint.escalation_language === targetLang
    ) {
      setLetterText(targetComplaint.escalation_document);
      setGenerationMethod(targetComplaint.escalation_generation_method ?? 'template');
      setSentAt(targetComplaint.escalation_notice_sent_at);
      return;
    }

    setLoading(true);
    try {
      const res = await generateEscalationLetterApi(targetComplaint.id, targetLang);
      setLetterText(res.letterText);
      setGenerationMethod(res.generationMethod);
      setDisclaimer(res.legalDisclaimer);
      setSentAt(res.complaint.escalation_notice_sent_at);
      onComplaintUpdated(res.complaint);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate legal escalation notice.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!complaint) return;
    const lang: SupportedLanguage =
      complaint.escalation_language ??
      (i18n.language === 'kn' || i18n.language === 'hi' ? i18n.language : 'en');
    setLanguage(lang);
    setConfirmChecked(false);
    setCopied(false);
    setSentAt(complaint.escalation_notice_sent_at);
    void loadOrGenerateLetter(complaint, lang, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaint?.id]);

  if (!complaint) return null;

  const handleLanguageChange = (nextLang: SupportedLanguage) => {
    setLanguage(nextLang);
    void loadOrGenerateLetter(complaint, nextLang, true);
  };

  const handleCopy = async () => {
    if (!letterText.trim()) return;
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Unable to copy automatically. Please select the text and copy manually.');
    }
  };

  const handleDownloadPdf = () => {
    if (!letterText.trim()) return;
    downloadEscalationPdf({
      complaint,
      letterText,
      language,
      generationMethod,
    });
  };

  const handleMarkSent = async () => {
    if (!confirmChecked) {
      setError('Please check the confirmation box before marking this escalation notice as sent.');
      return;
    }
    setMarkingSent(true);
    setError(null);
    try {
      const updated = await markEscalationSentApi(complaint.id, letterText);
      setSentAt(updated.escalation_notice_sent_at);
      onComplaintUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record escalation submission.');
    } finally {
      setMarkingSent(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 px-6 py-4 text-white">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400 font-semibold">
              <Scale className="h-4 w-4" />
              <span>{complaint.complaint_code}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.district}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <Sparkles className="h-3 w-3" />
                {generationMethod === 'gemini'
                  ? t('escalation.sourceGemini')
                  : t('escalation.sourceTemplate')}
              </span>
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-white">
              {t('escalation.modalTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            aria-label="Close escalation modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Language & Metadata Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Languages className="h-4 w-4 text-teal-700" />
            <span>{t('escalation.languageLabel')}:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  disabled={loading}
                  onClick={() => handleLanguageChange(opt.code)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    language === opt.code
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading || !letterText}
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? t('escalation.copiedBtn') : t('escalation.copyBtn')}</span>
            </button>
            <button
              type="button"
              disabled={loading || !letterText}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t('escalation.downloadPdfBtn')}</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {sentAt && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{t('escalation.alreadySent', { date: formatLocaleDateTime(sentAt, i18n.language) })}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
              <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
              <div className="text-xs font-medium">
                Drafting formal Karnataka municipal escalation representation ({language.toUpperCase()})...
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <FileText className="h-3.5 w-3.5" />
                  Editable Formal Representation Draft
                </span>
                <span>You may review or edit before downloading PDF or copying</span>
              </div>
              <textarea
                aria-label="Formal Escalation Representation Letter"
                rows={15}
                value={letterText}
                onChange={(e) => setLetterText(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/70 p-4 font-mono text-xs leading-relaxed text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {/* Legal Disclaimer */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[11px] leading-relaxed text-amber-950">
            <strong>Legal Transparency Notice: </strong>
            {disclaimer ||
              'This document is an automated formal administrative representation referencing the Karnataka Municipal Corporations Act, Karnataka Sakala Services Act, and Right to Information Act, 2005. It is not legal advice and is distinct from a standalone statutory RTI application.'}
          </div>
        </div>

        {/* Footer with Explicit Confirmation for Marking Sent */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
          {!sentAt && (
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>{t('escalation.confirmCheckbox')}</span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {t('common.close')}
            </button>

            {!sentAt && (
              <button
                type="button"
                disabled={loading || markingSent || !confirmChecked}
                onClick={() => void handleMarkSent()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{markingSent ? 'Recording...' : t('escalation.markSentBtn')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
