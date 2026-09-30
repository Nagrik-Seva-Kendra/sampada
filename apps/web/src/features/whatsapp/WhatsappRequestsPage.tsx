import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { WaWorkStatus } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useWaRequests } from "./useWhatsappRequests";
import {
  DEED_TYPE_LABEL,
  formatAmount,
  formatDate,
  INTAKE_STATUS_LABEL,
  WORK_STATUS_LABEL,
  WORK_STATUS_PILL,
  WORK_STATUSES,
} from "./waLabels";
import "./waRequests.css";

/** Staff: draft requests customers submitted through the WhatsApp bot. */
export function WhatsappRequestsPage() {
  const [workStatus, setWorkStatus] = useState<WaWorkStatus | "">("");
  const [needsStaff, setNeedsStaff] = useState<"" | "true" | "false">("");
  const query = useWaRequests({
    workStatus: workStatus || undefined,
    needsStaff: needsStaff === "" ? undefined : needsStaff === "true",
  });
  const rows = query.data?.data ?? [];
  const newCount = query.data?.newCount ?? 0;

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          WhatsApp
        </div>
        <div className="page-head">
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            WhatsApp अनुरोध
            {newCount > 0 && <span className="status-pill warn">{newCount} नए</span>}
          </h2>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            स्थिति
            <select
              className="dr-action-select"
              value={workStatus}
              onChange={(e) => setWorkStatus(e.target.value as WaWorkStatus | "")}
            >
              <option value="">सभी</option>
              {WORK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {WORK_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            स्टाफ जाँच
            <select
              className="dr-action-select"
              value={needsStaff}
              onChange={(e) => setNeedsStaff(e.target.value as "" | "true" | "false")}
            >
              <option value="">सभी</option>
              <option value="true">स्टाफ जाँच ज़रूरी</option>
              <option value="false">ज़रूरी नहीं</option>
            </select>
          </label>
        </div>

        <div className="wa-table-wrap">
          <table className="wa-table">
            <colgroup>
              <col className="wa-col-ref" />
              <col className="wa-col-customer" />
              <col className="wa-col-buyer" />
              <col className="wa-col-property" />
              <col className="wa-col-amount" />
              <col className="wa-col-status" />
              <col className="wa-col-assignee" />
              <col className="wa-col-date" />
            </colgroup>
            <thead>
              <tr>
                <th>अनुरोध नं.</th>
                <th>ग्राहक</th>
                <th>खरीदार / बंधककर्ता</th>
                <th>संपत्ति</th>
                <th>राशि</th>
                <th>स्थिति</th>
                <th>ज़िम्मेदार</th>
                <th>तारीख</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={8}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {query.isError && (
                <tr>
                  <td colSpan={8} className="doc-empty">
                    अनुरोध लोड नहीं हो सके। कृपया दोबारा कोशिश करें।
                  </td>
                </tr>
              )}
              {!query.isLoading && !query.isError && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="doc-empty">
                    कोई अनुरोध नहीं मिला।
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="wa-nowrap" style={{ fontWeight: 700 }}>
                    <Link to="/whatsapp-requests/$id" params={{ id: r.id }}>
                      {r.ref}
                    </Link>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.customerName ?? undefined}>
                      {r.customerName || "—"}
                    </div>
                    <div className="doc-sub wa-nowrap">{r.phoneMasked}</div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.buyerName ?? undefined}>
                      {r.buyerName || "—"}
                    </div>
                    <div className="doc-sub wa-nowrap">{DEED_TYPE_LABEL[r.deedType]}</div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.propertySummary ?? undefined}>
                      {r.propertySummary || "—"}
                    </div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={formatAmount(r.amount, r.amountMode)}>
                      {formatAmount(r.amount, r.amountMode)}
                    </div>
                  </td>
                  <td>
                    <div className="wa-badges">
                      {r.workStatus ? (
                        <span className={`status-pill ${WORK_STATUS_PILL[r.workStatus]}`}>
                          {WORK_STATUS_LABEL[r.workStatus]}
                        </span>
                      ) : (
                        <span className="status-pill neutral">{INTAKE_STATUS_LABEL[r.status]}</span>
                      )}
                      {r.needsStaff && <span className="status-pill bad">स्टाफ जाँच</span>}
                    </div>
                  </td>
                  <td>
                    <div className="wa-clamp-2" title={r.assigneeName ?? undefined}>
                      {r.assigneeName || "—"}
                    </div>
                  </td>
                  <td className="doc-sub" title={formatDate(r.createdAt)}>
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
