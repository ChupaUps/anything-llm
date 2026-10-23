import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EnvelopeSimple, Phone, ChatCircle } from "@phosphor-icons/react";
import System from "@/models/system";
import {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalPrimaryButton,
} from "@/components/lib/Modal";

/**
 * Contact channels an administrator can expose on the login page.
 * `href` builds an optional clickable link for the given value.
 */
const CHANNELS = [
  {
    key: "email",
    Icon: EnvelopeSimple,
    href: (value) => `mailto:${value}`,
  },
  {
    key: "phone",
    Icon: Phone,
    href: (value) => `tel:${value.replace(/[^\d+]/g, "")}`,
  },
  {
    key: "messenger",
    Icon: ChatCircle,
    href: null,
  },
];

/**
 * Shown when a user clicks "Forgot password" on the login page.
 * Explains that the password is reset by the administrator and lists only
 * the contact channels the administrator chose to display.
 */
export default function AdminContactModal({ onClose }) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    System.fetchSupportContacts().then((result) => {
      if (!cancelled) setContacts(result || {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const channels = CHANNELS.filter(({ key }) => !!contacts?.[key]);

  return (
    <div className="flex flex-col gap-y-5">
      <ModalHeader title={t("login.contacts.title")} onClose={onClose} />
      <ModalBody>
        <p className="text-sm text-zinc-300 light:text-slate-700">
          {t("login.contacts.description")}
        </p>
        {contacts === null ? (
          <p className="text-sm text-zinc-400 light:text-slate-500">...</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-zinc-400 light:text-slate-500">
            {t("login.contacts.not-configured")}
          </p>
        ) : (
          <ul className="flex flex-col gap-y-2">
            {channels.map(({ key, Icon, href }) => {
              const value = contacts[key];
              const row = (
                <span className="flex items-center gap-x-3 rounded-lg bg-zinc-800 light:bg-slate-100 px-3.5 py-2.5">
                  <Icon
                    size={18}
                    weight="bold"
                    className="shrink-0 text-sky-300 light:text-sky-600"
                  />
                  <span className="flex flex-col">
                    <span className="text-xs text-zinc-400 light:text-slate-500">
                      {t(`login.contacts.channels.${key}`)}
                    </span>
                    <span className="text-sm text-zinc-100 light:text-slate-900 break-all">
                      {value}
                    </span>
                  </span>
                </span>
              );
              const url = href?.(value);
              return (
                <li key={key}>
                  {url ? (
                    <a href={url} className="block hover:opacity-80">
                      {row}
                    </a>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter className="justify-end">
        <ModalPrimaryButton type="button" onClick={onClose}>
          {t("login.contacts.close")}
        </ModalPrimaryButton>
      </ModalFooter>
    </div>
  );
}
