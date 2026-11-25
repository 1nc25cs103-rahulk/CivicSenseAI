import { GoogleGenAI } from '@google/genai';
import { evaluateComplaintSla } from '../../shared/sla.ts';
import type { Complaint, ComplaintUpdate, SupportedLanguage } from '../../shared/types.ts';
import { KARNATAKA_DISTRICTS } from '../../shared/types.ts';

export const LEGAL_ESCALATION_DISCLAIMER: Record<SupportedLanguage, string> = {
  en: 'This draft is an automated formal administrative representation and RTI follow-up reference generated from complaint records. It is not legal advice and does not constitute a formal court filing. Citizens should verify dates, authority address, and statutory fee/filing procedures before submitting an RTI application.',
  kn: 'ಈ ಕರಡು ದೂರು ದಾಖಲೆಗಳ ಆಧಾರದ ಮೇಲೆ ತಯಾರಿಸಲಾದ ಔಪಚಾರಿಕ ಆಡಳಿತಾತ್ಮಕ ಮನವಿ ಮತ್ತು ಮಾಹಿತಿ ಹಕ್ಕು (RTI) ಉಲ್ಲೇಖ ಪತ್ರವಾಗಿದೆ. ಇದು ಕಾನೂನು ಸಲಹೆಯಲ್ಲ ಮತ್ತು ನ್ಯಾಯಾಲಯದ ಅರ್ಜಿಯಲ್ಲ. ಸಲ್ಲಿಸುವ ಮೊದಲು ದಿನಾಂಕಗಳು, ಅಧಿಕಾರಿಗಳ ವಿಳಾಸ ಮತ್ತು ನಿಯಮಿತ RTI ಸಲ್ಲಿಕೆ ವಿಧಾನವನ್ನು ದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ.',
  hi: 'यह मसौदा शिकायत रिकॉर्ड के आधार पर तैयार किया गया एक औपचारिक प्रशासनिक अभ्यावेदन और सूचना का अधिकार (RTI) संदर्भ पत्र है। यह कानूनी सलाह नहीं है और न ही कोई न्यायिक याचिका है। कृपया RTI आवेदन जमा करने से पहले तिथियों, अधिकारी के पते और निर्धारित प्रक्रिया की पुष्टि करें।',
};

function getAuthorityName(district: string): string {
  const preset = KARNATAKA_DISTRICTS.find((d) => d.name.toLowerCase() === district.toLowerCase());
  return preset?.authorityBody ?? `${district} Municipal Corporation`;
}

function formatDateReadable(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildAuditTimelineLines(updates: ComplaintUpdate[]): string {
  if (!updates.length) {
    return '- Initial complaint registered; no subsequent field resolution logged.';
  }
  return updates
    .slice(0, 8)
    .map((u) => `- [${formatDateReadable(u.updated_at)}] ${u.status}: ${u.remarks}`)
    .join('\n');
}

export function buildTemplateEscalationLetter(
  complaint: Complaint,
  updates: ComplaintUpdate[],
  language: SupportedLanguage
): string {
  const authority = getAuthorityName(complaint.district);
  const sla = evaluateComplaintSla(complaint);
  const todayStr = formatDateReadable(new Date().toISOString());
  const submittedStr = formatDateReadable(complaint.created_at);
  const deadlineStr = formatDateReadable(sla.deadlineIso);
  const timelineText = buildAuditTimelineLines(updates);
  const departmentName = complaint.department || 'Concerned Municipal Engineering Wing';

  if (language === 'kn') {
    return `ದಿನಾಂಕ: ${todayStr}
ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ: ${complaint.complaint_code}

ಗೆ,
ಆಯುಕ್ತರು / ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿ ಅಧಿಕಾರಿ (PIO) ಮತ್ತು ಕುಂದುಕೊರತೆ ನಿವಾರಣಾ ಅಧಿಕಾರಿ,
${authority},
${complaint.district} ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ.

ವಿಷಯ: ಸೇವಾ ಮಟ್ಟದ ಒಪ್ಪಂದ (SLA) ಉಲ್ಲಂಘನೆ ಮತ್ತು ನಾಗರಿಕ ಮೂಲಸೌಕರ್ಯ ದೂರಿನ (ಸಂಖ್ಯೆ: ${complaint.complaint_code}) ಮೇಲೆ ತುರ್ತು ಕ್ರಮ ಹಾಗೂ ಸ್ಥಿತಿಗತಿ ವಿವರಣೆ ಕೋರಿ ಔಪಚಾರಿಕ ಮನವಿ.

ಮಾನ್ಯರೇ,

ಈ ಮೂಲಕ ಕರ್ನಾಟಕ ಪುರಸಭೆಗಳ ಕಾಯ್ದೆ, ಕರ್ನಾಟಕ ಸಕಾಲ ಸೇವೆಗಳ ಕಾಯ್ದೆ (ನಾಗರಿಕರಿಗೆ ಸೇವೆಗಳ ಖಾತರಿ) ಹಾಗೂ ಮಾಹಿತಿ ಹಕ್ಕು ಕಾಯ್ದೆ, 2005 ರ ಅಡಿಯಲ್ಲಿ ನಾಗರಿಕ ಹೊಣೆಗಾರಿಕೆ ಮತ್ತು ಪಾರದರ್ಶಕ ಆಡಳಿತದ ಚೌಕಟ್ಟಿನಲ್ಲಿ ಈ ಔಪಚಾರಿಕ ಆಡಳಿತಾತ್ಮಕ ಮನವಿಯನ್ನು ಸಲ್ಲಿಸುತ್ತಿದ್ದೇನೆ.

1. ದೂರಿನ ವಿವರಗಳು:
- ದೂರು ಸಂಖ್ಯೆ: ${complaint.complaint_code}
- ವಿಷಯ: ${complaint.title}
- ವರ್ಗ: ${complaint.category}
- ಸ್ಥಳ: ${complaint.location}, ${complaint.locality}, ${complaint.district}
- ಜಿಪಿಎಸ್ ನಿರ್ದೇಶಾಂಕಗಳು: ${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}
- ದೂರು ದಾಖಲಾದ ದಿನಾಂಕ: ${submittedStr}
- ಆದ್ಯತಾ ಮಟ್ಟ ಮತ್ತು ಅಂಕ: ${complaint.priority_level} (${complaint.priority_score}/100)
- ನಿಗದಿತ SLA ಗಡುವು: ${deadlineStr} (${sla.windowLabel})
- ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ: ${complaint.status} (SLA ಅವಧಿ ಮೀರಿದೆ)
- ಸಂಬಂಧಪಟ್ಟ ಇಲಾಖೆ: ${departmentName}

2. ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತೆ ಮತ್ತು ಸಮಸ್ಯೆಯ ವಿವರಣೆ:
${complaint.description}
ಅಂದಾಜು ಬಾಧಿತ ನಾಗರಿಕರು: ${complaint.affected_citizens}.

3. ದೂರಿನ ಕ್ರಮಬದ್ಧ ಇತಿಹಾಸ:
${timelineText}

4. ಕೋರಲಾದ ತುರ್ತು ಕ್ರಮ ಮತ್ತು ಮಾಹಿತಿ:
ಅ) ಮೇಲೆ ತಿಳಿಸಿದ ಮೂಲಸೌಕರ್ಯ ಸಮಸ್ಯೆಯನ್ನು ಆದ್ಯತೆಯ ಮೇರೆಗೆ ಪರಿಶೀಲಿಸಿ ತುರ್ತು ದುರಸ್ತಿ ಕಾರ್ಯ ಕೈಗೊಳ್ಳಬೇಕು.
ಆ) ನಿಗದಿತ SLA ಗಡುವು (${deadlineStr}) ಮೀರಲು ಕಾರಣವಾದ ಆಡಳಿತಾತ್ಮಕ ವಿಳಂಬದ ವಿವರ ಮತ್ತು ಜವಾಬ್ದಾರಿಯುತ ಅಧಿಕಾರಿಯ ಮಾಹಿತಿಯನ್ನು ಲಿಖಿತವಾಗಿ ಒದಗಿಸಬೇಕು.
ಇ) ಈ ಮನವಿಯು ಔಪಚಾರಿಕ ಆಡಳಿತಾತ್ಮಕ ದೂರು ಆಗಿದ್ದು, 7 ದಿನಗಳೊಳಗೆ ಕ್ರಮ ಕೈಗೊಳ್ಳದಿದ್ದಲ್ಲಿ ಮಾಹಿತಿ ಹಕ್ಕು ಕಾಯ್ದೆ, 2005 ರ ಅಡಿಯಲ್ಲಿ ನಿಗದಿತ ಅರ್ಜಿ ಶುಲ್ಕದೊಂದಿಗೆ ಪ್ರತ್ಯೇಕ ಶಾಸನಬದ್ಧ RTI ಅರ್ಜಿಯನ್ನು ಸಲ್ಲಿಸುವ ಹಕ್ಕನ್ನು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ.

ವಿಶ್ವಾಸಪೂರ್ವಕವಾಗಿ,
${complaint.reporter_name || 'ನಾಗರಿಕ ದೂರುದಾರರು'}
ಸ್ಥಳ: ${complaint.locality}, ${complaint.district}

[ಸೂಚನೆ: ${LEGAL_ESCALATION_DISCLAIMER.kn}]`;
  }

  if (language === 'hi') {
    return `दिनांक: ${todayStr}
संदर्भ संख्या: ${complaint.complaint_code}

सेवा में,
आयुक्त / जन सूचना अधिकारी (PIO) एवं लोक शिकायत निवारण अधिकारी,
${authority},
जिला ${complaint.district}, कर्नाटक।

विषय: सेवा स्तर समझौता (SLA) उल्लंघन के संबंध में औपचारिक प्रशासनिक अभ्यावेदन एवं शिकायत संख्या ${complaint.complaint_code} पर तत्काल कार्रवाई हेतु अनुरोध।

महोदय/महोदया,

कर्नाटक नगर निगम अधिनियम, कर्नाटक सकाला सेवा अधिनियम (नागरिक सेवा गारंटी) तथा सूचना का अधिकार अधिनियम, 2005 के अंतर्गत पारदर्शिता एवं सार्वजनिक उत्तरदायित्व के प्रावधानों के संदर्भ में यह औपचारिक प्रशासनिक अभ्यावेदन प्रस्तुत किया जा रहा है।

1. शिकायत का विवरण:
- टिकट संख्या: ${complaint.complaint_code}
- शीर्षक: ${complaint.title}
- श्रेणी: ${complaint.category}
- स्थान: ${complaint.location}, ${complaint.locality}, ${complaint.district}
- जीपीएस निर्देशांक: ${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}
- पंजीकरण तिथि: ${submittedStr}
- प्राथमिकता स्तर एवं स्कोर: ${complaint.priority_level} (${complaint.priority_score}/100)
- निर्धारित SLA समयसीमा: ${deadlineStr} (${sla.windowLabel})
- वर्तमान स्थिति: ${complaint.status} (SLA समयसीमा व्यतीत)
- संबंधित विभाग: ${departmentName}

2. जन सुरक्षा एवं समस्या का विवरण:
${complaint.description}
अनुमानित प्रभावित नागरिक: ${complaint.affected_citizens}।

3. शिकायत का कालानुक्रमिक विवरण (ऑडिट इतिहास):
${timelineText}

4. अपेक्षित कार्रवाई एवं विवरण:
(क) उक्त नागरिक समस्या के तत्काल स्थल निरीक्षण एवं स्थायी समाधान हेतु संबंधित अभियंता को निर्देशित किया जाए।
(ख) निर्धारित SLA समयसीमा (${deadlineStr}) के भीतर निवारण न होने के कारणों तथा प्रस्तावित पूर्णता तिथि की लिखित सूचना प्रदान की जाए।
(ग) कृपया ध्यान दें कि यह एक औपचारिक प्रशासनिक अभ्यावेदन है; यदि समयबद्ध कार्रवाई नहीं होती है तो सूचना का अधिकार अधिनियम, 2005 के अंतर्गत निर्धारित शुल्क व प्रक्रिया के साथ पृथक वैधानिक RTI आवेदन दाखिल किया जा सकता है।

भवदीय,
${complaint.reporter_name || 'नागरिक शिकायतकर्ता'}
स्थान: ${complaint.locality}, ${complaint.district}

[अस्वीकरण: ${LEGAL_ESCALATION_DISCLAIMER.hi}]`;
  }

  return `Date: ${todayStr}
Reference Ticket: ${complaint.complaint_code}

To,
The Commissioner / Public Information Officer (PIO) & Grievance Redressal Officer,
${authority},
${complaint.district} District, Karnataka.

Subject: Formal Administrative Escalation Representation Regarding SLA Breach on Civic Infrastructure Complaint ${complaint.complaint_code}

Respected Sir/Madam,

I am submitting this formal administrative representation regarding an unresolved public infrastructure complaint that has exceeded its designated Service Level Agreement (SLA) timeline. This notice is issued in reference to municipal civic duties under the Karnataka Municipal Corporations Act, time-bound public service accountability principles under the Karnataka Sakala Services Act, and public record transparency under the Right to Information Act, 2005.

1. Complaint & Location Summary:
- Ticket Reference: ${complaint.complaint_code}
- Issue Title: ${complaint.title}
- Infrastructure Category: ${complaint.category}
- Street Address / Locality: ${complaint.location}, ${complaint.locality}, ${complaint.district}
- Verified GPS Coordinates: ${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}
- Date Submitted: ${submittedStr}
- AI Triage Priority: ${complaint.priority_level} (${complaint.priority_score}/100)
- Designated SLA Deadline: ${deadlineStr} (${sla.windowLabel})
- Current Status: ${complaint.status} (SLA Breached)
- Concerned Department: ${departmentName}

2. Description & Public Impact:
${complaint.description}
Estimated affected citizens in the locality: ${complaint.affected_citizens}.

3. Chronological Audit Trail:
${timelineText}

4. Requested Administrative Action & Accountability Follow-Up:
(a) Please direct the concerned engineering wing (${departmentName}) to inspect the site immediately and complete corrective restoration works without further delay.
(b) Please provide a written status update specifying the officer responsible, reasons for the SLA delay past ${deadlineStr}, and the confirmed completion date.
(c) Note: This document serves as a formal administrative escalation representation and not a standalone statutory RTI filing. Should this matter remain unresolved, the complainant reserves the right to file a separate statutory application under the Right to Information Act, 2005 following prescribed fee and submission procedures.

Yours faithfully,
${complaint.reporter_name || 'Citizen Complainant'}
Locality: ${complaint.locality}, ${complaint.district}

[Disclaimer: ${LEGAL_ESCALATION_DISCLAIMER.en}]`;
}

export async function generateEscalationLetter(
  complaint: Complaint,
  updates: ComplaintUpdate[],
  language: SupportedLanguage
): Promise<{
  letterText: string;
  generationMethod: 'gemini' | 'template';
  legalDisclaimer: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const disclaimer = LEGAL_ESCALATION_DISCLAIMER[language] ?? LEGAL_ESCALATION_DISCLAIMER.en;

  if (!apiKey) {
    return {
      letterText: buildTemplateEscalationLetter(complaint, updates, language),
      generationMethod: 'template',
      legalDisclaimer: disclaimer,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const authority = getAuthorityName(complaint.district);
    const sla = evaluateComplaintSla(complaint);
    const langLabel = language === 'kn' ? 'Kannada' : language === 'hi' ? 'Hindi' : 'English';

    // Send only minimal sanitized civic complaint details (never send passwords, internal tokens, or private emails/phones)
    const sanitizedContext = {
      ticketCode: complaint.complaint_code,
      title: complaint.title,
      description: complaint.description.slice(0, 600),
      category: complaint.category,
      location: complaint.location,
      locality: complaint.locality,
      district: complaint.district,
      authority,
      coordinates: `${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}`,
      submittedOn: formatDateReadable(complaint.created_at),
      slaDeadline: formatDateReadable(sla.deadlineIso),
      slaWindow: sla.windowLabel,
      priorityScore: complaint.priority_score,
      priorityLevel: complaint.priority_level,
      status: complaint.status,
      affectedCitizens: complaint.affected_citizens,
      department: complaint.department || 'Concerned Municipal Engineering Wing',
      complainantDisplayName: complaint.reporter_name || 'Citizen Complainant',
      auditHistory: updates.slice(0, 6).map((u) => `${formatDateReadable(u.updated_at)} - ${u.status}: ${u.remarks}`),
    };

    const prompt = `Draft a formal, respectful, print-ready municipal administrative escalation representation letter in ${langLabel} for a Karnataka citizen whose civic complaint has breached its SLA deadline.

Strict legal accuracy rules:
1. Reference the Karnataka Municipal Corporations Act, the Karnataka Sakala Services Act, and the Right to Information Act, 2005 ONLY by their general titles—DO NOT fabricate specific section numbers, penalties, or case citations.
2. Explicitly distinguish this document as a formal administrative escalation representation and clarify that a separate statutory RTI application requires prescribed filing procedure/fee.
3. Include a brief closing note stating this draft is not legal advice.
4. Keep formatting clean plain text (no markdown asterisks or code fences), with Date, Reference Ticket, Addressee (${authority}), Subject, Complaint Summary, Audit Trail, Requested Action, and Signature block.

Sanitized Complaint Record:
${JSON.stringify(sanitizedContext, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.25,
      },
    });

    const generated = response.text?.trim();
    if (!generated || generated.length < 180) {
      return {
        letterText: buildTemplateEscalationLetter(complaint, updates, language),
        generationMethod: 'template',
        legalDisclaimer: disclaimer,
      };
    }

    return {
      letterText: generated,
      generationMethod: 'gemini',
      legalDisclaimer: disclaimer,
    };
  } catch (err) {
    console.warn('[CivicSense Escalation] Gemini draft failed, using verified fallback template:', err instanceof Error ? err.message : err);
    return {
      letterText: buildTemplateEscalationLetter(complaint, updates, language),
      generationMethod: 'template',
      legalDisclaimer: disclaimer,
    };
  }
}
