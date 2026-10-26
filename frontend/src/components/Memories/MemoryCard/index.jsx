import moment from "moment";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsThreeVertical, PushPin } from "@phosphor-icons/react";
import CardMenu from "../CardMenu";

/**
 * Presentational memory card shared by the chat sidebar and the account block.
 * @param {Object} props
 * @param {object} props.memory
 * @param {boolean} [props.isWorkspace] - scope of the list this card is rendered in
 * @param {boolean} [props.canMove] - hide the move action when the target scope is full
 * @param {boolean} [props.showWorkspace] - show the owning workspace name
 * @param {function} props.onEdit
 * @param {function} [props.onMove]
 * @param {function} props.onTogglePin
 * @param {function} props.onDelete
 */
export default function MemoryCard({
  memory,
  isWorkspace = false,
  canMove = false,
  showWorkspace = false,
  onEdit,
  onMove,
  onTogglePin,
  onDelete,
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="relative shrink-0 bg-zinc-900 light:bg-white light:border light:border-slate-300 rounded-lg p-3 flex gap-0.5 items-start">
      <div className="flex-1 min-w-0">
        {showWorkspace && memory.workspace?.name && (
          <p className="text-[10px] font-medium uppercase tracking-[1.2px] text-zinc-500 light:text-slate-500 mb-1 truncate">
            {memory.workspace.name}
          </p>
        )}
        <p className="text-sm leading-5 text-zinc-50 light:text-slate-900">
          {memory.content}
        </p>
        <p className="text-xs leading-4 text-zinc-400 light:text-slate-500 mt-1.5 flex items-center gap-1 flex-wrap">
          {memory.pinned && (
            <span className="inline-flex items-center gap-0.5 text-zinc-300 light:text-slate-700">
              <PushPin size={11} weight="fill" />
              {t("chat_window.memories.card.pinned")}
            </span>
          )}
          {memory.lastUsedAt && (
            <span>
              {t("chat_window.memories.card.used", {
                date: moment(memory.lastUsedAt).format("ll"),
              })}
            </span>
          )}
          {!memory.lastUsedAt && (
            <span>{moment(memory.createdAt).format("ll")}</span>
          )}
          {memory.expiresAt && (
            <span>
              {t("chat_window.memories.card.expires", {
                date: moment(memory.expiresAt).format("ll"),
              })}
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onTogglePin(memory)}
        title={
          memory.pinned
            ? t("chat_window.memories.menu.unpin")
            : t("chat_window.memories.menu.pin")
        }
        className={`shrink-0 border-none bg-transparent cursor-pointer p-0 transition-colors ${
          memory.pinned
            ? "text-sky-400 light:text-sky-600"
            : "text-zinc-500 light:text-slate-400 hover:text-zinc-50 light:hover:text-slate-900"
        }`}
      >
        <PushPin size={16} weight={memory.pinned ? "fill" : "regular"} />
      </button>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="shrink-0 border-none bg-transparent cursor-pointer text-zinc-400 light:text-slate-400 hover:text-zinc-50 light:hover:text-slate-900 transition-colors p-0"
      >
        <DotsThreeVertical size={20} weight="bold" />
      </button>
      {menuOpen && (
        <CardMenu
          menuRef={menuRef}
          buttonRef={buttonRef}
          isWorkspace={isWorkspace}
          canMove={canMove}
          pinned={memory.pinned}
          onEdit={() => {
            setMenuOpen(false);
            onEdit(memory);
          }}
          onMove={() => {
            setMenuOpen(false);
            onMove?.(memory);
          }}
          onTogglePin={() => {
            setMenuOpen(false);
            onTogglePin(memory);
          }}
          onDelete={() => {
            setMenuOpen(false);
            onDelete(memory);
          }}
        />
      )}
    </div>
  );
}
