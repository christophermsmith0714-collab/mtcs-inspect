import nodemailer from "nodemailer";
import type { Inspection, InspectionTemplate, InspectionQuestion, InspectionAnswer, User } from "@shared/schema";

// Uses Gmail SMTP or any SMTP configured via env vars
// In production, set: EMAIL_USER, EMAIL_PASS, EMAIL_FROM
function getTransporter() {
  const user = process.env.EMAIL_USER || "";
  const pass = process.env.EMAIL_PASS || "";

  if (user && pass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  // Fallback: Ethereal (test/preview mode) — no real email sent
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "test@ethereal.email",
      pass: "testpass",
    },
  });
}

function buildReportHtml(
  inspection: Inspection,
  template: InspectionTemplate,
  questions: InspectionQuestion[],
  answers: InspectionAnswer[],
  client: User
): string {
  const answerMap = new Map(answers.map(a => [a.questionId, a]));
  const sections = [...new Set(questions.map(q => q.section))];

  const statusColor = (ans: string | null | undefined) => {
    if (ans === "yes") return "#16a34a";
    if (ans === "no") return "#dc2626";
    if (ans === "n/a") return "#6b7280";
    return "#9ca3af";
  };

  const statusLabel = (ans: string | null | undefined) => {
    if (ans === "yes") return "YES";
    if (ans === "no") return "NO";
    if (ans === "n/a") return "N/A";
    return "—";
  };

  const totalQ = questions.length;
  const yesCount = answers.filter(a => a.answer === "yes").length;
  const noCount = answers.filter(a => a.answer === "no").length;
  const naCount = answers.filter(a => a.answer === "n/a").length;

  const sectionsHtml = sections.map(section => {
    const sectionQs = questions.filter(q => q.section === section).sort((a, b) => a.order - b.order);
    const rows = sectionQs.map(q => {
      const a = answerMap.get(q.id);
      const photoCount = a?.photoUrls ? JSON.parse(a.photoUrls).length : 0;
      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;font-size:13px;color:#374151;line-height:1.5;">${q.questionText}</td>
          <td style="padding:10px 12px;text-align:center;white-space:nowrap;">
            <span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.05em;background:${statusColor(a?.answer)}1a;color:${statusColor(a?.answer)};">
              ${statusLabel(a?.answer)}
            </span>
          </td>
          <td style="padding:10px 12px;font-size:12px;color:#6b7280;">${a?.comments || ""}</td>
          <td style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:center;">${photoCount > 0 ? `📷 ${photoCount}` : ""}</td>
        </tr>`;
    }).join("");

    return `
      <div style="margin-bottom:24px;">
        <div style="background:#f3f4f6;padding:8px 12px;border-left:3px solid #15803d;margin-bottom:0;">
          <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">${section}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Question</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Answer</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Comments</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Photos</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  const completedDate = inspection.completedAt
    ? new Date(inspection.completedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const inspectionDate = new Date(inspection.inspectionDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:#15803d;border-radius:12px 12px 0 0;padding:28px 32px;color:#fff;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.75;margin-bottom:4px;">
            ${template.type === "spcc" ? "SPCC Inspection Report · 40 CFR Part 112" : "Stormwater Inspection Report · MSGP/SWPPP"}
          </div>
          <div style="font-size:22px;font-weight:700;line-height:1.2;">${inspection.facilityName}</div>
          ${inspection.facilityAddress ? `<div style="font-size:13px;opacity:0.8;margin-top:4px;">${inspection.facilityAddress}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:8px;padding:6px 14px;">
            <div style="font-size:11px;opacity:0.75;">Completed</div>
            <div style="font-size:14px;font-weight:600;">${completedDate}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Meta bar -->
    <div style="background:#fff;padding:16px 32px;border-bottom:1px solid #e5e7eb;display:flex;gap:32px;flex-wrap:wrap;">
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px;">Inspector</div><div style="font-size:13px;font-weight:600;color:#111827;">${inspection.inspectorName}</div></div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px;">Inspection Date</div><div style="font-size:13px;font-weight:600;color:#111827;">${inspectionDate}</div></div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px;">Client</div><div style="font-size:13px;font-weight:600;color:#111827;">${client.company || client.name}</div></div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px;">Inspection Type</div><div style="font-size:13px;font-weight:600;color:#111827;">${template.name}</div></div>
    </div>

    <!-- Summary scores -->
    <div style="background:#fff;padding:20px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:12px;">Summary</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#16a34a;">${yesCount}</div>
          <div style="font-size:11px;color:#15803d;font-weight:600;">YES</div>
        </div>
        <div style="flex:1;min-width:100px;background:#fef2f2;border-radius:8px;padding:12px 16px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#dc2626;">${noCount}</div>
          <div style="font-size:11px;color:#b91c1c;font-weight:600;">NO</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f9fafb;border-radius:8px;padding:12px 16px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#6b7280;">${naCount}</div>
          <div style="font-size:11px;color:#6b7280;font-weight:600;">N/A</div>
        </div>
        <div style="flex:1;min-width:100px;background:#eff6ff;border-radius:8px;padding:12px 16px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#1d4ed8;">${totalQ}</div>
          <div style="font-size:11px;color:#1d4ed8;font-weight:600;">TOTAL</div>
        </div>
      </div>
      ${noCount > 0 ? `<div style="margin-top:12px;padding:10px 14px;background:#fef2f2;border-radius:6px;border-left:3px solid #dc2626;font-size:12px;color:#7f1d1d;"><strong>Action Required:</strong> ${noCount} item${noCount > 1 ? "s" : ""} answered NO and may require corrective action. Review findings below.</div>` : `<div style="margin-top:12px;padding:10px 14px;background:#f0fdf4;border-radius:6px;border-left:3px solid #16a34a;font-size:12px;color:#14532d;"><strong>All Clear:</strong> No deficiencies noted during this inspection.</div>`}
    </div>

    <!-- General comments -->
    ${inspection.generalComments ? `
    <div style="background:#fff;padding:16px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:8px;">General Comments</div>
      <div style="font-size:13px;color:#374151;line-height:1.6;">${inspection.generalComments}</div>
    </div>` : ""}

    <!-- Inspection detail -->
    <div style="background:#fff;padding:24px 32px;border-radius:0 0 12px 12px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:16px;">Inspection Detail</div>
      ${sectionsHtml}
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;text-align:center;">
      <div style="font-size:11px;color:#9ca3af;line-height:1.6;">
        This report was automatically generated by InspectPro.<br>
        Powered by Midwest Training and Consulting Services (MTCS) · midwest-training.com<br>
        Questions? Contact <a href="mailto:info@midwest-training.com" style="color:#15803d;">info@midwest-training.com</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendInspectionReport(
  inspection: Inspection,
  template: InspectionTemplate,
  questions: InspectionQuestion[],
  answers: InspectionAnswer[],
  client: User
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  try {
    const transporter = getTransporter();
    const html = buildReportHtml(inspection, template, questions, answers, client);

    const inspectionDate = new Date(inspection.inspectionDate).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"InspectPro · MTCS" <noreply@midwest-training.com>`,
      to: client.email,
      subject: `Inspection Report — ${inspection.facilityName} · ${inspectionDate}`,
      html,
    });

    // Ethereal preview URL for testing
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

    return { success: true, previewUrl: previewUrl as string | undefined };
  } catch (err: any) {
    console.error("Email send error:", err);
    return { success: false, error: err.message };
  }
}
