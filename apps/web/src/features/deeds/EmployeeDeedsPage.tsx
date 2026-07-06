import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { DeedList } from "./DeedList";
import { NewDeedForm } from "./MyDeedsPage";
import { useEveryoneDeeds } from "./useDeedRegister";

/** Employee view: every deed — admin's, every partner's, every employee's. Edit/create/print, never delete. */
export function EmployeeDeedsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const deeds = useEveryoneDeeds();

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("navAllDeeds")}
        </div>
        <h2 className="page-title">{t("navAllDeeds")}</h2>

        <NewDeedForm />

        <h3 className="er-section">{t("drAll")}</h3>
        {deeds.isError && <p className="modal-error">{t("drError")}</p>}
        {deeds.data && <DeedList deeds={deeds.data} showCreator canEdit canDelete={false} />}
      </div>
    </section>
  );
}
