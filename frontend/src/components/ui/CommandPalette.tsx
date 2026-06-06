import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
  phase: string;
}

const ACTIONS = [
  { group: "Navigation", id: "new", label: "New Document", hint: "Start fresh upload", icon: "⊕", action: "reset" },
  { group: "Navigation", id: "docs", label: "Documentation", hint: "ISO 26262 reference", icon: "📚", action: null },
  { group: "Shortcuts", id: "export", label: "Export Test Cases", hint: "Excel or JIRA CSV", icon: "↓", action: null },
  { group: "Shortcuts", id: "undo", label: "Undo Last Edit", hint: "Ctrl+Z", icon: "↩", action: null },
];

export function CommandPalette({ open, onClose, onReset, phase }: Props) {
  function handleSelect(action: string | null) {
    onClose();
    if (action === "reset") setTimeout(onReset, 100);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
              zIndex: 200, backdropFilter: "blur(4px)",
            }}
          />
          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
              zIndex: 201,
            }}
          >
            <Command>
              <Command.Input placeholder="Search actions, shortcuts, documents…" autoFocus />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                {["Navigation", "Shortcuts"].map(group => (
                  <Command.Group key={group} heading={group}>
                    {ACTIONS.filter(a => a.group === group).map(item => (
                      <Command.Item
                        key={item.id}
                        value={item.label}
                        onSelect={() => handleSelect(item.action)}
                      >
                        <span style={{ fontSize: "1rem", width: 20, textAlign: "center" }}>{item.icon}</span>
                        <span style={{ flex: 1, fontSize: "0.875rem", fontWeight: 500, color: "var(--c-text)" }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{item.hint}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
