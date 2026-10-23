import React, { useEffect, useState } from "react";
import System from "../../../models/system";
import { AUTH_TOKEN, AUTH_USER } from "../../../utils/constants";
import paths from "../../../utils/paths";
import Modal from "@/components/lib/Modal";
import { useModal } from "@/hooks/useModal";
import { useTranslation } from "react-i18next";
import PasswordInput from "@/components/lib/PasswordInput";
import AdminContactModal from "./AdminContactModal";

export default function MultiUserAuth() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customAppName, setCustomAppName] = useState(null);

  const {
    isOpen: isContactModalOpen,
    openModal: openContactModal,
    closeModal: closeContactModal,
  } = useModal();

  const handleLogin = async (e) => {
    setError(null);
    setLoading(true);
    e.preventDefault();
    const data = {};
    const form = new FormData(e.target);
    for (var [key, value] of form.entries()) data[key] = value;
    const { valid, user, token, message } = await System.requestToken(data);
    if (valid && !!token && !!user) {
      window.localStorage.setItem(AUTH_USER, JSON.stringify(user));
      window.localStorage.setItem(AUTH_TOKEN, token);
      window.location = paths.home();
      return;
    }
    setError(message);
    setLoading(false);
  };

  useEffect(() => {
    const fetchCustomAppName = async () => {
      const { appName } = await System.fetchCustomAppName();
      setCustomAppName(appName || "");
      setLoading(false);
    };
    fetchCustomAppName();
  }, []);

  return (
    <>
      <form
        onSubmit={handleLogin}
        className="flex flex-col justify-center items-center"
      >
        <div className="flex items-start justify-between pt-7 pb-9">
          <div className="flex items-center flex-col gap-y-[18px] max-w-[300px]">
            <div className="flex gap-x-1">
              <h3 className="text-white light:text-slate-950 text-[38px] leading-[28px] font-medium text-center white-space-nowrap block">
                {t("login.multi-user.welcome")}
              </h3>
            </div>
            <p className="text-zinc-400 light:text-zinc-600 text-sm text-center">
              {t("login.sign-in", {
                appName: customAppName || "Интершторм-ИИ",
              })}
            </p>
          </div>
        </div>
        <div className="w-full px-12">
          <div className="w-full flex flex-col gap-y-3">
            <div className="w-full flex flex-col gap-y-2">
              <label className="text-zinc-300 light:text-slate-800 text-sm">
                {t("login.multi-user.placeholder-username")}
              </label>
              <input
                name="username"
                type="text"
                className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
                required={true}
                autoComplete="off"
              />
            </div>
            <div className="w-full px-0 flex flex-col gap-y-2">
              <label className="text-zinc-300 light:text-slate-800 text-sm">
                {t("login.multi-user.placeholder-password")}
              </label>
              <PasswordInput
                name="password"
                containerClassName="w-[300px]"
                className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-full h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
                required={true}
                autoComplete="off"
              />
            </div>
            {error && <p className="text-red-400 text-sm">Error: {error}</p>}
          </div>
        </div>
        <div className="flex items-center px-12 mt-9 space-x-2 w-full flex-col gap-y-6">
          <button
            disabled={loading}
            type="submit"
            className="text-zinc-950 bg-white hover:bg-zinc-300 light:bg-sky-200 light:text-slate-950 light:hover:bg-sky-300 text-sm font-semibold rounded-lg border-primary-button h-[34px] w-full"
          >
            {loading
              ? t("login.multi-user.validating")
              : t("login.multi-user.login")}
          </button>
          <button
            type="button"
            className="text-zinc-200 light:text-zinc-600 hover:text-sky-300 light:hover:text-sky-600 hover:underline text-sm flex gap-x-1"
            onClick={openContactModal}
          >
            {t("login.multi-user.forgot-pass")}?
            <b className="font-semibold text-sky-300 light:text-sky-600">
              {t("login.contacts.cta")}
            </b>
          </button>
        </div>
      </form>

      <Modal isOpen={isContactModalOpen} onClose={closeContactModal}>
        <AdminContactModal onClose={closeContactModal} />
      </Modal>
    </>
  );
}
