import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "@phosphor-icons/react";
import System from "@/models/system";
import Memory from "@/models/memory";
import showToast from "@/utils/toast";
import MemoryCard from "@/components/Memories/MemoryCard";
import MemoryModal from "@/components/Memories/MemoryModal";

const DEFAULT_LIMITS = { global: 15, workspace: 20, ttlDays: 90 };

/**
 * Account-level memories block. Lists every memory owned by the signed-in user
 * (personal first, then grouped by workspace) and lets them add, edit, pin and
 * delete entries without opening a chat.
 */
export default function MemoriesSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [memories, setMemories] = useState({ global: [], workspace: [] });
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [modalState, setModalState] = useState({ open: false, mode: "create" });
  const [editingMemory, setEditingMemory] = useState(null);

  async function refresh() {
    const data = await Memory.forUser();
    if (data.error)
      showToast(
        t("profile_settings.memories_block.load_failed", { error: data.error }),
        "error"
      );
    setMemories({ global: data.global, workspace: data.workspace });
    if (data.limits) setLimits(data.limits);
  }

  useEffect(() => {
    async function load() {
      const settings = await System.keys();
      const isEnabled = !!settings?.MemoryEnabled;
      setEnabled(isEnabled);
      if (isEnabled) await refresh();
      setLoading(false);
    }
    load();
  }, []);

  async function handleCreate(content) {
    const { error } = await Memory.createPersonal(content);
    if (error)
      showToast(
        t("profile_settings.memories_block.save_failed", { error }),
        "error"
      );
    else await refresh();
  }

  async function handleEdit(memory, content) {
    const { error } = await Memory.update(memory.id, { content });
    if (error)
      showToast(
        t("profile_settings.memories_block.save_failed", { error }),
        "error"
      );
    else await refresh();
  }

  async function handleTogglePin(memory) {
    const { error } = await Memory.update(memory.id, {
      pinned: !memory.pinned,
    });
    if (error)
      showToast(
        t("profile_settings.memories_block.pin_failed", { error }),
        "error"
      );
    else await refresh();
  }

  async function handleDelete(memory) {
    const { success, error } = await Memory.delete(memory.id);
    if (!success)
      showToast(
        t("profile_settings.memories_block.delete_failed", { error }),
        "error"
      );
    else await refresh();
  }

  function openCreateModal() {
    setEditingMemory(null);
    setModalState({ open: true, mode: "create" });
  }

  function openEditModal(memory) {
    setEditingMemory(memory);
    setModalState({ open: true, mode: "edit" });
  }

  function closeModal() {
    setModalState({ open: false, mode: "create" });
    setEditingMemory(null);
  }

  if (loading) return null;

  if (!enabled) {
    return (
      <p className="text-sm leading-5 text-zinc-400 light:text-slate-600">
        {t("profile_settings.memories_block.disabled")}
      </p>
    );
  }

  const workspaceGroups = groupByWorkspace(memories.workspace);
  return (
    <div className="flex flex-col gap-y-5 w-full">
      <div>
        <p className="text-sm leading-5 text-zinc-400 light:text-slate-600">
          {t("profile_settings.memories_block.description")}
        </p>
      </div>

      <section className="flex flex-col gap-y-2">
        <div className="flex items-center justify-between gap-x-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-50 light:text-slate-900">
              {t("profile_settings.memories_block.personal")}
            </p>
            <p className="text-xs text-zinc-400 light:text-slate-500">
              {t("profile_settings.memories_block.limit", {
                count: memories.global.length,
                limit: limits.global,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={memories.global.length >= limits.global}
            title={t("profile_settings.memories_block.add")}
            className="shrink-0 flex items-center gap-x-1 h-[34px] px-3 rounded-lg text-sm font-medium border-none bg-zinc-50 light:bg-slate-900 text-zinc-950 light:text-white hover:opacity-80 transition-opacity duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} weight="bold" />
            {t("profile_settings.memories_block.add")}
          </button>
        </div>
        {memories.global.length === 0 ? (
          <p className="text-sm leading-5 text-zinc-400 light:text-slate-500">
            {t("profile_settings.memories_block.empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {memories.global.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onEdit={openEditModal}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {workspaceGroups.length > 0 && (
        <section className="flex flex-col gap-y-2">
          <p className="text-sm font-medium text-zinc-50 light:text-slate-900">
            {t("profile_settings.memories_block.workspace")}
          </p>
          {workspaceGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-[1.2px] text-zinc-500 light:text-slate-500 truncate">
                {group.name}
              </p>
              {group.memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  isWorkspace
                  onEdit={openEditModal}
                  onTogglePin={handleTogglePin}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ))}
        </section>
      )}

      <p className="text-xs leading-4 text-zinc-400 light:text-slate-500">
        {t("profile_settings.memories_block.retention", {
          days: limits.ttlDays,
        })}
      </p>

      <MemoryModal
        isOpen={modalState.open}
        mode={modalState.mode}
        initialContent={editingMemory?.content || ""}
        onClose={closeModal}
        onSubmit={(content) => {
          if (modalState.mode === "edit" && editingMemory)
            handleEdit(editingMemory, content);
          else handleCreate(content);
        }}
      />
    </div>
  );
}

/**
 * Groups workspace-scoped memories by their owning workspace, keeping the
 * incoming (most recently updated) order inside each group.
 * @param {object[]} memories
 * @returns {{key: string, name: string, memories: object[]}[]}
 */
function groupByWorkspace(memories) {
  const groups = new Map();
  for (const memory of memories || []) {
    const key = memory.workspace?.id ?? memory.workspaceId ?? "none";
    if (!groups.has(key))
      groups.set(key, {
        key,
        name: memory.workspace?.name || "—",
        memories: [],
      });
    groups.get(key).memories.push(memory);
  }
  return Array.from(groups.values());
}
