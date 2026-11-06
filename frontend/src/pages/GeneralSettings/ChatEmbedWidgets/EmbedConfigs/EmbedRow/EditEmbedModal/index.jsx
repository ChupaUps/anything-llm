import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BooleanInput,
  ChatModeSelection,
  NumberInput,
  PermittedDomains,
  WorkspaceSelection,
  enforceSubmissionSchema,
} from "../../NewEmbedModal";
import Embed from "@/models/embed";
import showToast from "@/utils/toast";
import { safeJsonParse } from "@/utils/request";
import {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalPrimaryButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";

export default function EditEmbedModal({ embed, closeModal }) {
  const { t } = useTranslation();
  const [error, setError] = useState(null);

  const handleUpdate = async (e) => {
    setError(null);
    e.preventDefault();
    const form = new FormData(e.target);
    const data = enforceSubmissionSchema(form);
    const { success, error } = await Embed.updateEmbed(embed.id, data);
    if (success) {
      showToast(t("embeddable.modal.updatedToast"), "success", { clear: true });
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
    setError(error);
  };

  return (
    <form onSubmit={handleUpdate} className="flex flex-col gap-y-5">
      <ModalHeader
        title={t("embeddable.modal.editTitle", { id: embed.id })}
        onClose={closeModal}
      />
      <ModalBody>
        <WorkspaceSelection defaultValue={embed.workspace.id} />
        <ChatModeSelection defaultValue={embed.chat_mode} />
        <PermittedDomains
          defaultValue={safeJsonParse(embed.allowlist_domains, null) || []}
        />
        <NumberInput
          name="max_chats_per_day"
          title={t("embeddable.modal.maxChatsDayTitle")}
          hint={t("embeddable.modal.maxChatsDayHint")}
          defaultValue={embed.max_chats_per_day}
        />
        <NumberInput
          name="max_chats_per_session"
          title={t("embeddable.modal.maxChatsSessionTitle")}
          hint={t("embeddable.modal.maxChatsSessionHint")}
          defaultValue={embed.max_chats_per_session}
        />
        <NumberInput
          name="message_limit"
          title={t("embeddable.modal.messageLimitTitle")}
          hint={t("embeddable.modal.messageLimitHint")}
          defaultValue={embed.message_limit}
        />
        <BooleanInput
          name="allow_model_override"
          title={t("embeddable.modal.allowModelTitle")}
          hint={t("embeddable.modal.allowModelHint")}
          defaultValue={embed.allow_model_override}
        />
        <BooleanInput
          name="allow_temperature_override"
          title={t("embeddable.modal.allowTemperatureTitle")}
          hint={t("embeddable.modal.allowTemperatureHint")}
          defaultValue={embed.allow_temperature_override}
        />
        <BooleanInput
          name="allow_prompt_override"
          title={t("embeddable.modal.allowPromptTitle")}
          hint={t("embeddable.modal.allowPromptHint")}
          defaultValue={embed.allow_prompt_override}
        />

        {error && (
          <p className="text-red-400 text-sm">
            {t("embeddable.modal.error", { message: error })}
          </p>
        )}
        <p className="text-xs text-zinc-400 light:text-slate-600">
          {t("embeddable.modal.noteStart")}
          <code className="border-none bg-zinc-800 light:bg-stone-300 text-white mx-1 px-1 rounded-sm">
            &lt;script&gt;
          </code>{" "}
          {t("embeddable.modal.noteEnd")}
        </p>
      </ModalBody>
      <ModalFooter>
        <ModalSecondaryButton onClick={closeModal} type="button">
          {t("embeddable.modal.cancel")}
        </ModalSecondaryButton>
        <ModalPrimaryButton type="submit">
          {t("embeddable.modal.editCta")}
        </ModalPrimaryButton>
      </ModalFooter>
    </form>
  );
}
