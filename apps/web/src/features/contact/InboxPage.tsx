import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useContactMessages } from "./useContact";

export function InboxPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const messages = useContactMessages();

  const list = messages.data ?? [];

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("inboxLink")}
        </div>
        <h2 className="page-title">{t("inboxTitle")}</h2>

        {messages.isError && <p className="modal-error">{t("inboxError")}</p>}

        <div className="doc-list" style={{ marginTop: 16 }}>
          {list.map((m) => (
            <div className="msg" key={m.id}>
              <div className="msg-head">
                <span className="msg-name">{m.name}</span>
                <span className="msg-date">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="msg-contacts">
                <a href={`mailto:${m.email}`}>{m.email}</a>
                {m.phone && <span> · {m.phone}</span>}
              </div>
              <p className="msg-body">{m.message}</p>
            </div>
          ))}
          {list.length === 0 && !messages.isLoading && !messages.isError && (
            <p className="doc-empty">{t("inboxEmpty")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
