"use client";

// Static mockup carried over from the previous hardcoded project folder.
// project_knowledge (AI/RAG) is out of scope for this build — nothing here
// is wired to the backend. It exists so the project tab bar doesn't 404.

import Link from "next/link";
import { useParams } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { ProjectPageHead } from "@/components/org/project-tabs";
import { useProjectViewOnly } from "@/components/billing/locked";
import "@/app/org/org.css";

type Doc = { name: string; type: string; typeBadge: string; updated: string };

const DOCS: Doc[] = [
  { name: "Project brochure", type: "PDF", typeBadge: "b-rose", updated: "12 Aug 2026" },
  { name: "Price list — Aug 2026", type: "Sheet", typeBadge: "b-green", updated: "05 Aug 2026" },
  { name: "Floor plans — all types", type: "PDF", typeBadge: "b-rose", updated: "28 Jul 2026" },
  { name: "RERA certificate", type: "PDF", typeBadge: "b-rose", updated: "02 Jun 2026" },
  { name: "Payment plan (CLP)", type: "Sheet", typeBadge: "b-green", updated: "05 Aug 2026" },
];

const FAQS = [
  {
    q: "What is the price of a 3 BHK?",
    a: "₹1.1 Cr onwards for a 1,650 sqft 3 BHK, plus GST & registration. Corner units carry a premium.",
  },
  {
    q: "When is possession?",
    a: "Possession is scheduled for December 2027 as per the RERA-registered completion date.",
  },
  {
    q: "Are there home-loan tie-ups?",
    a: "Yes — approved by HDFC, SBI, ICICI and Axis Bank with up to 80% funding and subvention options.",
  },
  {
    q: "What amenities are included?",
    a: "Swimming pool, clubhouse & gym, landscaped garden, kids play area, 2-level parking, 24×7 security and power backup.",
  },
  {
    q: "How far is the airport?",
    a: "SVP International Airport is about 18 km (35–40 min) via SG Highway. Vaishnodevi Circle is 6 km.",
  },
  {
    q: "What is the maintenance charge?",
    a: "₹3.5 / sqft per month, with an 18-month advance maintenance deposit collected at possession.",
  },
];

const PRICING = [
  { tier: "2 BHK", sqft: "1,180 sqft", price: "₹68 L" },
  { tier: "3 BHK", sqft: "1,650 sqft", price: "₹1.1 Cr" },
  { tier: "4 BHK Penthouse", sqft: "2,940 sqft", price: "₹2.4 Cr" },
];

export default function OrgProjectKnowledgePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  // Billing v2: nothing can be added to a view-only project.
  const viewOnly = useProjectViewOnly(id);

  return (
    <>
      <ProjectPageHead
        active="knowledge"
        actions={viewOnly ? null : <button className="btn btn-primary">＋ Add knowledge</button>}
      />

      <Reveal delay={1}>
        <div className="help mb-18">
          The project knowledge base (documents, FAQs, pricing for the AI
          agents) isn&apos;t wired up yet — this is a preview.
        </div>
      </Reveal>

      <div className="grid g-2-1">
        {/* LEFT */}
        <div className="col gap-18">
          <Reveal delay={1}>
            <div className="card">
              <div className="card-h">
                <span className="t">Documents</span>
                <span className="badge b-sky">5 files</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Updated</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {DOCS.map((d) => (
                      <tr key={d.name}>
                        <td><b>{d.name}</b></td>
                        <td><span className={`badge ${d.typeBadge}`}>{d.type}</span></td>
                        <td>{d.updated}</td>
                        <td>
                          <a href="#" className="brand">View</a>
                          {" · "}
                          <a href="#" className="muted">Replace</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="card">
              <div className="card-h">
                <span className="t">FAQs / Q&amp;A</span>
                <span className="badge b-sky">6 answers</span>
              </div>
              <div className="card-b col gap-16">
                {FAQS.map((f) => (
                  <div key={f.q}>
                    <div className="row between">
                      <b>{f.q}</b>
                      <a href="#" className="brand fs-12-5">Edit</a>
                    </div>
                    <div className="muted fs-13 mt-4">{f.a}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* RIGHT */}
        <div className="col gap-18">
          <Reveal delay={1}>
            <div className="card">
              <div className="card-h">
                <span className="t">Pricing sheet</span>
                <span className="badge b-green">Live</span>
              </div>
              <div className="card-b col gap-12">
                {PRICING.map((p) => (
                  <div key={p.tier} className="row between">
                    <span>
                      <b>{p.tier}</b><br />
                      <span className="muted fs-12">{p.sqft}</span>
                    </span>
                    <b>{p.price}</b>
                  </div>
                ))}
                <div className="divider" />
                <div className="row between">
                  <span className="muted">Base rate</span>
                  <b>₹5,800 / sqft</b>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="card">
              <div className="card-h"><span className="t">Used by</span></div>
              <div className="card-b col gap-12">
                <div className="u">
                  <span className="av a3"><Icon name="sparkles" size={16} /></span>
                  <span>
                    <span className="nm">Aarohi</span><br />
                    <span className="sm">AI voice agent</span>
                  </span>
                </div>
                <div className="u">
                  <span className="av a2"><Icon name="mail" size={16} /></span>
                  <span>
                    <span className="nm">Property Q&amp;A bot</span><br />
                    <span className="sm">WhatsApp agent</span>
                  </span>
                </div>
                <Link
                  className="btn btn-ghost btn-block mt-4"
                  href={`/org/projects/${id}/ai-calling`}
                >
                  Manage AI agents →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
