"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { ListPager } from "@/components/ui/list-pager";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR } from "@/lib/billing/pricing";
import { useBillingQuery } from "./context";
import { Empty, ErrorNote, Loading, PAYMENT_STATUS_META, SampleDataTag, Section } from "./ui";

function useDownload() {
  const { toast } = useToast();
  return (url: string | null, name: string) => {
    if (url) {
      window.open(url, "_blank", "noopener");
      return;
    }
    // The backend will return signed PDF URLs; until then there's no file.
    toast({ variant: "info", title: "PDF not available yet", description: `${name} will download here once invoices are generated.` });
  };
}

export function InvoicesTable({ pageSize = 10, paged = true, action }: { pageSize?: number; paged?: boolean; action?: React.ReactNode }) {
  const [page, setPage] = useState(1);
  const download = useDownload();
  const { data, error } = useBillingQuery((c) => c.listInvoices({ page, pageSize }), [page, pageSize]);

  return (
    <>
      <Section title={<span className="bl-row" style={{ gap: 8 }}>Invoices <SampleDataTag fns={["listInvoices"]} /></span>} sub="GST invoices for every payment" action={action} flush>
        {error ? (
          <div style={{ padding: 16 }}>
            <ErrorNote message={error} />
          </div>
        ) : !data ? (
          <Loading what="invoices" />
        ) : data.total === 0 ? (
          <Empty>No invoices yet — you&apos;re on the free plan.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>For</th>
                  <th style={{ textAlign: "right" }}>Taxable</th>
                  <th style={{ textAlign: "right" }}>GST</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((i) => (
                  <tr key={i.id}>
                    <td className="bl-mono">{i.number}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(i.issuedAt)}</td>
                    <td>{i.description}</td>
                    <td style={{ textAlign: "right" }}>{formatINR(i.subtotal)}</td>
                    <td style={{ textAlign: "right" }}>{formatINR(i.gst)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(i.total)}</td>
                    <td>
                      <span className={`badge ${i.status === "paid" ? "b-green" : "b-gray"}`}>{i.status === "paid" ? "Paid" : i.status === "refunded" ? "Refunded" : "Void"}</span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(i.pdfUrl, i.number)}>
                        <Icon name="download" size={14} /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {paged && data ? <ListPager page={page} total={data.total} pageSize={pageSize} onPageChange={setPage} noun="invoices" /> : null}
    </>
  );
}

export function PaymentHistoryTable({ pageSize = 10 }: { pageSize?: number }) {
  const [page, setPage] = useState(1);
  const download = useDownload();
  const { data, error } = useBillingQuery((c) => c.listPayments({ page, pageSize }), [page, pageSize]);
  return (
    <>
      <Section title={<span className="bl-row" style={{ gap: 8 }}>Payment history <SampleDataTag fns={["listPayments"]} /></span>} sub="Every attempt, including failed ones" flush>
        {error ? (
          <div style={{ padding: 16 }}>
            <ErrorNote message={error} />
          </div>
        ) : !data ? (
          <Loading what="payments" />
        ) : data.total === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>For</th>
                  <th>Method</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.createdAt)}</td>
                    <td>
                      {p.description}
                      <div className="bl-muted bl-mono" style={{ fontSize: 11 }}>{p.reference}</div>
                    </td>
                    <td>{p.method}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(p.amount)}</td>
                    <td>
                      <span className={`badge ${PAYMENT_STATUS_META[p.status].badge}`}>{PAYMENT_STATUS_META[p.status].label}</span>
                      {p.failureReason ? <div style={{ fontSize: 11, color: "var(--rose)", marginTop: 3 }}>{p.failureReason}</div> : null}
                    </td>
                    <td>
                      {p.status === "captured" ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(p.receiptUrl, `Receipt ${p.reference}`)}>
                          <Icon name="download" size={14} /> Receipt
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {data ? <ListPager page={page} total={data.total} pageSize={pageSize} onPageChange={setPage} noun="payments" /> : null}
    </>
  );
}
