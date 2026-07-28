import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import type { PropertyCategory, PropertyCreateInput } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import {
  useAddPropertyImages,
  useAdminProperty,
  useCreateProperty,
  useRemovePropertyImage,
  useUpdateProperty,
  propertyImageUrl,
} from "./useProperties";

const CATEGORIES: PropertyCategory[] = ["PLOT", "VILLA", "FLAT", "AGRICULTURAL_LAND"];
const CATEGORY_KEY: Record<PropertyCategory, StringKey> = {
  PLOT: "propertyCategoryPlot",
  VILLA: "propertyCategoryVilla",
  FLAT: "propertyCategoryFlat",
  AGRICULTURAL_LAND: "propertyCategoryAgriLand",
};

interface FormState {
  title: string;
  category: PropertyCategory;
  description: string;
  addressLine: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  areaValue: string;
  areaUnit: string;
  priceValue: string;
  priceLabel: string;
  contactName: string;
  contactPhone: string;
}

const EMPTY: FormState = {
  title: "",
  category: "PLOT",
  description: "",
  addressLine: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  areaValue: "",
  areaUnit: "",
  priceValue: "",
  priceLabel: "",
  contactName: "",
  contactPhone: "",
};

function toInput(f: FormState): PropertyCreateInput {
  return {
    title: f.title.trim(),
    category: f.category,
    description: f.description.trim() || undefined,
    addressLine: f.addressLine.trim(),
    city: f.city.trim(),
    district: f.district.trim() || undefined,
    state: f.state.trim() || undefined,
    pincode: f.pincode.trim() || undefined,
    areaValue: f.areaValue ? Number(f.areaValue) : undefined,
    areaUnit: f.areaUnit.trim() || undefined,
    priceValue: f.priceValue ? Number(f.priceValue) : undefined,
    priceLabel: f.priceLabel.trim() || undefined,
    contactName: f.contactName.trim() || undefined,
    contactPhone: f.contactPhone.trim() || undefined,
  };
}

/** Staff: create or edit a property listing. Image upload/removal is only available once the listing exists (edit mode). */
export function PropertyFormPage({ mode }: { mode: "create" | "edit" }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const navigate = useNavigate();
  // strict:false so this same component works unconditionally for both the
  // create route (no $id) and the edit route ($id) without a conditional hook call.
  const params = useParams({ strict: false }) as { id?: string };
  const id = mode === "edit" ? params.id : undefined;

  const existing = useAdminProperty(id ?? "");
  const create = useCreateProperty();
  const update = useUpdateProperty();
  const addImages = useAddPropertyImages();
  const removeImage = useRemovePropertyImage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => {
    if (!existing.data) return;
    setForm({
      title: existing.data.title,
      category: existing.data.category,
      description: existing.data.description ?? "",
      addressLine: existing.data.addressLine,
      city: existing.data.city,
      district: existing.data.district ?? "",
      state: existing.data.state,
      pincode: existing.data.pincode ?? "",
      areaValue: existing.data.areaValue?.toString() ?? "",
      areaUnit: existing.data.areaUnit ?? "",
      priceValue: existing.data.priceValue?.toString() ?? "",
      priceLabel: existing.data.priceLabel ?? "",
      contactName: existing.data.contactName ?? "",
      contactPhone: existing.data.contactPhone ?? "",
    });
  }, [existing.data]);

  function field<K extends keyof FormState>(key: K) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput(form);
    if (mode === "create") {
      const created = await create.mutateAsync(input);
      navigate({ to: "/properties/$id/edit", params: { id: created.id } });
    } else if (id) {
      await update.mutateAsync({ id, input });
    }
  }

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length && id) addImages.mutate({ id, files });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const saving = create.isPending || update.isPending;

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 720 }}>
        <Link to="/properties" className="kicker" style={{ textDecoration: "none" }}>
          <span className="rule" />
          {t("propertyFormBack")}
        </Link>
        <h2 className="page-title">{t(mode === "create" ? "propertyFormTitleCreate" : "propertyFormTitleEdit")}</h2>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
          <label>
            {t("propertyFieldTitle")}
            <input className="doc-btn" style={{ width: "100%" }} required {...field("title")} />
          </label>

          <label>
            {t("propertyFieldCategory")}
            <select className="doc-btn" style={{ width: "100%" }} {...field("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_KEY[c])}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("propertyFieldDescription")}
            <textarea className="doc-btn" style={{ width: "100%", minHeight: 90 }} {...field("description")} />
          </label>

          <label>
            {t("propertyFieldAddress")}
            <input className="doc-btn" style={{ width: "100%" }} required {...field("addressLine")} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              {t("propertyFieldCity")}
              <input className="doc-btn" style={{ width: "100%" }} required {...field("city")} />
            </label>
            <label>
              {t("propertyFieldDistrict")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("district")} />
            </label>
            <label>
              {t("propertyFieldState")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("state")} />
            </label>
            <label>
              {t("propertyFieldPincode")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("pincode")} />
            </label>
            <label>
              {t("propertyFieldArea")}
              <input className="doc-btn" style={{ width: "100%" }} type="number" min="0" {...field("areaValue")} />
            </label>
            <label>
              {t("propertyFieldAreaUnit")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("areaUnit")} />
            </label>
            <label>
              {t("propertyFieldPrice")}
              <input className="doc-btn" style={{ width: "100%" }} type="number" min="0" {...field("priceValue")} />
            </label>
            <label>
              {t("propertyFieldPriceLabel")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("priceLabel")} />
            </label>
            <label>
              {t("propertyFieldContactName")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("contactName")} />
            </label>
            <label>
              {t("propertyFieldContactPhone")}
              <input className="doc-btn" style={{ width: "100%" }} {...field("contactPhone")} />
            </label>
          </div>

          {(create.isError || update.isError) && (
            <p className="modal-error">{(create.error ?? update.error)?.message}</p>
          )}

          <button type="submit" className="btn-calc" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? t("propertyFormSaving") : t("propertyFormSave")}
          </button>
        </form>

        <h3 style={{ margin: "28px 0 10px", fontSize: 16, fontWeight: 700 }}>{t("propertyImagesHeading")}</h3>
        {mode === "create" || !id ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{t("propertyImagesHint")}</p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              {existing.data?.images.map((img) => (
                <div key={img.id} style={{ position: "relative" }}>
                  <img
                    src={propertyImageUrl(id, img.id)}
                    alt=""
                    style={{ width: 120, height: 90, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage.mutate({ id, imageId: img.id })}
                    aria-label={t("propertiesActionDelete")}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "50%",
                      width: 24,
                      height: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickImages} />
            {addImages.isPending && <p style={{ fontSize: 12, color: "var(--muted)" }}>{t("propertyImagesUploading")}</p>}
          </>
        )}
      </div>
    </section>
  );
}
